"""SoundWave Backend — Lógica de descarga con yt-dlp."""

import asyncio
import json
import urllib.request
from contextlib import suppress
from pathlib import Path

import yt_dlp
from cache import download_progress
from config import BASE_DIR, COVERS_DIR, LYRICS_DIR, MUSIC_DIR
from db import _db_lock, get_db
from logging_config import get_logger

from utils import get_mp3_path

logger = get_logger(__name__)


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
):
    """Descargar canción: audio MP3 + cover + letras."""
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
        _search_dirs = [
            BASE_DIR.parent,
            BASE_DIR,
            BASE_DIR.parent / "bin",
            BASE_DIR.parent.parent,
            Path.home() / "Downloads",
        ]
        _ffmpeg_dir = None
        for d in _search_dirs:
            if (d / "ffmpeg.exe").exists():
                _ffmpeg_dir = str(d)
                break
        if not _ffmpeg_dir:
            logger.info("ffmpeg.exe not found, using system PATH")

        # ── 2. Descargar audio ────────────────────────────────────────
        _ydl_opts = {
            # client "android" (itag 18): único que sirve el archivo completo;
            # el default restringe rangos a ~512KB y devuelve HTTP 403.
            "format": "18/bestaudio/best",
            "extractor_args": {"youtube": {"player_client": ["android"]}},
            "outtmpl": str(MUSIC_DIR / f"{video_id}.%(ext)s"),
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
            "progress_hooks": [_hook],
            "quiet": True,
            "no_warnings": True,
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
            with yt_dlp.YoutubeDL(_ydl_opts) as ydl:
                ydl.download([f"https://www.youtube.com/watch?v={video_id}"])

            if not mp3_path.exists():
                for ext in ("m4a", "webm", "ogg", "opus", "mp4"):
                    alt = MUSIC_DIR / f"{video_id}.{ext}"
                    if alt.exists():
                        alt.rename(mp3_path)
                        break

        download_progress[video_id] = {"status": "saving", "progress": 100}

        # ── 3. Descargar cover art ────────────────────────────────────
        cover_path = COVERS_DIR / f"{video_id}.jpg"
        if not cover_path.exists() and thumbnail:
            try:
                hd_thumb = thumbnail
                if "googleusercontent.com" in thumbnail:
                    hd_thumb = thumbnail.split("=")[0] + "=w576-h576-l90-rj"
                req = urllib.request.Request(
                    hd_thumb,
                    headers={"User-Agent": "Mozilla/5.0", "Referer": ""},
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    cover_path.write_bytes(resp.read())
            except Exception as ce:
                logger.warning("Cover art failed %s: %s", video_id, ce)

        # ── 4. Descargar letras (importación directa, sin self-request) ─
        lyrics_path = LYRICS_DIR / f"{video_id}.lrc"
        if not lyrics_path.exists():
            try:
                from lyrics import get_lyrics as _get_lyrics

                result = asyncio.run(_get_lyrics(video_id, title, artist))
                lrc = result.get("lyrics")
                if isinstance(lrc, list) and lrc:
                    lyrics_path.write_text("\n".join(lrc), encoding="utf-8")
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
