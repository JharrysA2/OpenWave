"""OpenWave Backend — Lógica de descarga con yt-dlp."""

import asyncio
import json
import os
import subprocess
import urllib.request
from contextlib import suppress
from pathlib import Path

import yt_dlp
from cache import download_progress
from config import (
    BASE_DIR,
    COVERS_DIR,
    LYRICS_DIR,
    MUSIC_DIR,
    PROJECT_DIR,
    YT_DLP_CACHE_DIR,
)
from db import _db_lock, get_db
from logging_config import get_logger

from utils import get_mp3_path

logger = get_logger(__name__)


def _ffmpeg_binary(ffmpeg_dir: str | None) -> str:
    """Binario de ffmpeg a partir del directorio ya localizado (o el PATH)."""
    if ffmpeg_dir:
        for name in ("ffmpeg.exe", "ffmpeg"):
            cand = Path(ffmpeg_dir) / name
            if cand.is_file():
                return str(cand)
    return "ffmpeg"


def cover_candidates(thumbnail: str, thumbnails: list | None) -> list:
    """URLs de portada ordenadas de MEJOR a peor calidad.

    Prioriza la resolución más alta del array thumbnails[] (y su variante
    maxresdefault de ytimg / w2048 de googleusercontent, que suelen ser la
    resolución máxima real) y deja la `thumbnail` suelta como último
    recurso. Cada candidata se intenta en orden hasta que una descarga.
    """
    cands: list = []

    def _push(u):
        if u and u not in cands:
            cands.append(u)

    best = ""
    raw = thumbnails or []
    if isinstance(raw, list) and raw:
        valid = [t for t in raw if isinstance(t, dict) and t.get("url")]
        if valid:
            best = max(
                valid,
                key=lambda t: (t.get("width") or 0) * (t.get("height") or 0),
            ).get("url", "")

    if "googleusercontent.com" in best:
        _push(best.split("=")[0] + "=w2048-h2048-l90-rj")
    if "ytimg.com" in best:
        # …/vi/{id}/hq720.jpg → …/vi/{id}/maxresdefault.jpg (máxima)
        parts = best.split("/")
        if len(parts) > 1:
            _push("/".join(parts[:-1]) + "/maxresdefault.jpg")
    _push(best)
    if thumbnail and "googleusercontent.com" in thumbnail:
        _push(thumbnail.split("=")[0] + "=w2048-h2048-l90-rj")
    _push(thumbnail)
    return cands


def do_download(
    video_id: str,
    title: str,
    artist: str,
    thumbnail: str,
    duration: int,
    album_title: str = "",
    album_type: str = "",
    album_browse_id: str = "",
    artist_browse_id: str = "",
    thumbnails: list = None,
    quality: str = "192",
    year: str = "",
):
    """Descargar canción: audio MP3 (tags ID3 + portada embebida) + cover + letras.

    `quality` = bitrate MP3 elegido en el cliente (Ajustes → Reproductor y
    sonido): "128" | "192" | "320". Cualquier otro valor cae a 192.
    `year` (opcional) va al tag ID3 `date` y al sidecar de metadata.
    """
    if str(quality) not in ("128", "192", "320"):
        quality = "192"
    download_progress[video_id] = {"status": "downloading", "progress": 0}

    def _hook(d):
        if d["status"] == "downloading":
            pct = d.get("_percent_str", "0%").strip().replace("%", "")
            with suppress(Exception):
                download_progress[video_id]["progress"] = float(pct)
        elif d["status"] == "finished":
            download_progress[video_id] = {"status": "converting", "progress": 100}

    try:
        # ── 1. Buscar ffmpeg ──────────────────────────────────────────
        # Prioridad al ffmpeg empaquetado junto a la app (MSI) o al
        # preparado para desarrollo en Windows (build/staging/ffmpeg);
        # después el comportamiento histórico y, por último, el PATH.
        _search_dirs = [
            BASE_DIR.parent / "ffmpeg",
            PROJECT_DIR / "build" / "staging" / "ffmpeg",
            BASE_DIR.parent,
            BASE_DIR,
            BASE_DIR.parent / "bin",
            BASE_DIR.parent.parent,
            Path.home() / "Downloads",
        ]
        _ffmpeg_dir = None
        for d in _search_dirs:
            if (d / "ffmpeg.exe").is_file() or (d / "ffmpeg").is_file():
                _ffmpeg_dir = str(d)
                break
        if not _ffmpeg_dir:
            logger.info("ffmpeg.exe not found, using system PATH")

        # ── 2. Portada en MÁXIMA calidad (ANTES del audio: la embebemos
        #       en los tags ID3 del MP3) ─────────────────────────────────
        cover_path = COVERS_DIR / f"{video_id}.jpg"
        if not cover_path.exists():
            got_cover = False
            for cand in cover_candidates(thumbnail, thumbnails):
                tmp_cover = COVERS_DIR / f"{video_id}.jpg.part"
                try:
                    req = urllib.request.Request(
                        cand,
                        headers={"User-Agent": "Mozilla/5.0", "Referer": ""},
                    )
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        data = resp.read()
                    if not data:
                        continue
                    # Escritura ATÓMICA: el .jpg final solo aparece completo.
                    tmp_cover.write_bytes(data)
                    os.replace(tmp_cover, cover_path)
                    got_cover = True
                    break
                except Exception as ce:
                    logger.debug(
                        "cover candidate failed %s (%s): %s", video_id, cand, ce
                    )
                    with suppress(OSError):
                        tmp_cover.unlink(missing_ok=True)
            if not got_cover:
                logger.warning("Cover art failed %s", video_id)

        # ── 3. Descargar audio ────────────────────────────────────────
        _ydl_opts = {
            # Mejor fuente de AUDIO disponible (m4a/opus de mayor bitrate
            # que el muxed) con caída al itag 18 (360p) dentro de la propia
            # cadena de selectores. El client "android" es el único que
            # sirve el archivo completo: el default restringe rangos a
            # ~512KB y devuelve HTTP 403.
            "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/18/best",
            "extractor_args": {"youtube": {"player_client": ["android"]}},
            "outtmpl": str(MUSIC_DIR / f"{video_id}.%(ext)s"),
            "progress_hooks": [_hook],
            "quiet": True,
            "no_warnings": True,
            # Caché de yt-dlp dentro del directorio de datos de la app
            # (si no, cae en %USERPROFILE%\.cache\yt-dlp).
            "cachedir": str(YT_DLP_CACHE_DIR),
        }
        if _ffmpeg_dir:
            _ydl_opts["ffmpeg_location"] = _ffmpeg_dir

        # Idempotente: si el MP3 ya está (descarga individual previa o
        # descarga de álbum reintentada), no volver a bajar el audio.
        mp3_path = get_mp3_path(video_id)
        if mp3_path.exists():
            logger.info("skip yt-dlp %s: MP3 ya descargado", video_id)
            download_progress[video_id] = {"status": "converting", "progress": 100}
        else:
            try:
                with yt_dlp.YoutubeDL(_ydl_opts) as ydl:
                    ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
            except yt_dlp.utils.DownloadError as e:
                # Reintento con la cadena histórica (itag 18 primero): en
                # algunos vídeos el bestaudio baja pero 403ea al descargar
                # los bytes; el muxed 18 siempre funciona. Copia de opts:
                # la primera configuración queda intacta (auditoría/tests).
                logger.warning("bestaudio falló %s (%s): reintento 18", video_id, e)
                _ydl_opts = {**_ydl_opts, "format": "18/bestaudio/best"}
                with yt_dlp.YoutubeDL(_ydl_opts) as ydl:
                    ydl.download([f"https://www.youtube.com/watch?v={video_id}"])

            # ── Conversión ATÓMICA a MP3 ───────────────────────────────
            # Sin el postprocesador FFmpegExtractAudio de yt-dlp: ese PP
            # escribe el .mp3 FINAL directamente (temp_path == new_path),
            # así que mientras ffmpeg convierte, get_mp3_path().exists()
            # ya devuelve True con un archivo PARCIAL — y el modo «Alta»
            # (ensureDownloaded / stream/exists / pre-cache) lo interpreta
            # como «descarga lista» y reproducía un stub de 15-30 s (los
            # bytes parciales del MP3 a 192 kb/s) en vez de la canción.
            # Aquí la conversión va a `.part` y solo `os.replace` publica
            # el .mp3: desde entonces exists() ⇒ COMPLETO (mismo patrón
            # de escritura atómica que _build_low_quality en streaming.py).
            src = next(
                (
                    MUSIC_DIR / f"{video_id}.{ext}"
                    for ext in ("mp4", "m4a", "webm", "ogg", "opus")
                    if (MUSIC_DIR / f"{video_id}.{ext}").exists()
                ),
                None,
            )
            if src is None:
                raise RuntimeError("yt-dlp no produjo ningún archivo de audio")
            tmp = MUSIC_DIR / f"{video_id}.mp3.part"
            try:
                # Tags ID3 + portada embebida (APIC): el MP3 queda con su
                # información dentro — se ve en cualquier reproductor externo.
                cmd = [_ffmpeg_binary(_ffmpeg_dir), "-y", "-i", str(src)]
                embed_cover = cover_path.exists()
                if embed_cover:
                    cmd += ["-i", str(cover_path), "-map", "0:a:0", "-map", "1:v:0"]
                    # -c:v mjpeg sin bitrate: el JPEG de portada ya viene
                    # comprimido; attached_pic + id3v2.3 = cover estándar.
                    cmd += [
                        "-c:v",
                        "mjpeg",
                        "-id3v2_version",
                        "3",
                        "-disposition:v:0",
                        "attached_pic",
                        "-metadata:s:v",
                        "title=Album cover",
                        "-metadata:s:v",
                        "comment=Cover (front)",
                    ]
                else:
                    cmd += ["-vn"]
                cmd += ["-acodec", "libmp3lame", "-b:a", f"{quality}k"]
                if title:
                    cmd += ["-metadata", f"title={title}"]
                if artist:
                    cmd += ["-metadata", f"artist={artist}"]
                if album_title:
                    cmd += ["-metadata", f"album={album_title}"]
                if year:
                    cmd += ["-metadata", f"date={year}"]
                # El destino termina en .part: declarar el contenedor.
                cmd += ["-f", "mp3", str(tmp)]
                subprocess.run(
                    cmd,
                    check=True,
                    capture_output=True,
                    timeout=300,
                )
                # El .mp3 final solo aparece COMPLETO con este rename.
                os.replace(tmp, mp3_path)
            finally:
                with suppress(OSError):
                    tmp.unlink(missing_ok=True)
            with suppress(OSError):
                src.unlink(missing_ok=True)

        download_progress[video_id] = {"status": "saving", "progress": 100}

        # ── 4. Descargar letras (importación directa, sin self-request) ─
        lyrics_path = LYRICS_DIR / f"{video_id}.lrc"
        if not lyrics_path.exists():
            try:
                from lyrics import get_lyrics as _get_lyrics

                result = asyncio.run(_get_lyrics(video_id, title, artist))
                lrc = result.get("lyrics")
                if isinstance(lrc, list) and lrc:
                    # Escritura atómica (mismo patrón que el MP3 y el cover).
                    tmp_lrc = LYRICS_DIR / f"{video_id}.lrc.part"
                    try:
                        tmp_lrc.write_text("\n".join(lrc), encoding="utf-8")
                        os.replace(tmp_lrc, lyrics_path)
                    finally:
                        with suppress(OSError):
                            tmp_lrc.unlink(missing_ok=True)
            except Exception as le:
                logger.warning("Lyrics failed %s: %s", video_id, le)

        # ── 5. Guardar metadata ───────────────────────────────────────
        meta_path = MUSIC_DIR / f"{video_id}.json"
        with suppress(Exception):
            meta_path.write_text(
                json.dumps(
                    {
                        "videoId": video_id,
                        "title": title,
                        "artist": artist,
                        "album": album_title,
                        "albumType": album_type,
                        "year": year,
                        "quality": str(quality),
                        "thumbnail": thumbnail,
                        "duration": duration,
                        "cover": str(cover_path) if cover_path.exists() else None,
                        "lyrics": str(lyrics_path) if lyrics_path.exists() else None,
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

        # ── 6. Registrar en DB (con thumbnails[] HD) ────────────────
        thumbnails_json = json.dumps(thumbnails or [], ensure_ascii=False)
        with _db_lock, get_db() as conn:
            conn.execute(
                """INSERT INTO downloads(video_id,title,artist,thumbnail,duration,file_path,
                   album_title,album_type,thumbnails,album_browse_id,artist_browse_id)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(video_id) DO UPDATE SET
                       downloaded_at=strftime('%Y-%m-%dT%H:%M:%S','now'),
                       album_title=CASE WHEN excluded.album_title != '' THEN excluded.album_title ELSE downloads.album_title END,
                       album_type=CASE WHEN excluded.album_type != '' THEN excluded.album_type ELSE downloads.album_type END,
                       album_browse_id=CASE WHEN excluded.album_browse_id != '' THEN excluded.album_browse_id ELSE downloads.album_browse_id END,
                       artist_browse_id=CASE WHEN excluded.artist_browse_id != '' THEN excluded.artist_browse_id ELSE downloads.artist_browse_id END,
                       thumbnails=excluded.thumbnails""",
                (
                    video_id,
                    title,
                    artist,
                    thumbnail,
                    duration,
                    str(mp3_path),
                    album_title,
                    album_type,
                    thumbnails_json,
                    album_browse_id,
                    artist_browse_id,
                ),
            )

        download_progress[video_id] = {"status": "done", "progress": 100}

    except Exception as e:
        download_progress[video_id] = {
            "status": "error",
            "progress": 0,
            "error": str(e),
        }
        logger.error("Download Error %s: %s", video_id, e)
