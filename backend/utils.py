"""SoundWave Backend — Funciones auxiliares."""

import re
from pathlib import Path

from config import MUSIC_DIR
from fastapi import HTTPException

# video_id de YouTube: solo caracteres URL-safe sin separadores de path.
# Allowlist estricta que bloquea path traversal (CWE-22): rechaza "\", "/",
# ".", ":" y cualquier carácter que pathlib/Windows use como separador.
VIDEO_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,80}$")


def is_valid_video_id(video_id) -> bool:
    """Verificar que un video_id no contenga caracteres peligrosos."""
    return isinstance(video_id, str) and bool(VIDEO_ID_RE.match(video_id))


def require_valid_video_id(video_id) -> None:
    """Rechazar video_ids inválidos en endpoints que tocan el filesystem."""
    if not is_valid_video_id(video_id):
        raise HTTPException(status_code=400, detail="video_id inválido")


def upgrade_goog_url(url: str, px: int = 1200) -> str:
    """Forzar googleusercontent a HD agregando =wN-hN-l90-rj."""
    if not url or "googleusercontent.com" not in url:
        return url
    base = url.split("=")[0]
    return f"{base}=w{px}-h{px}-l90-rj"


def best_thumb(thumbnails) -> str:
    """Elegir thumbnail de mayor resolución."""
    if not thumbnails:
        return ""
    if isinstance(thumbnails, dict):
        thumbnails = thumbnails.get("thumbnails", [thumbnails])
    if not isinstance(thumbnails, list) or not thumbnails:
        return ""
    google = [t for t in thumbnails if "googleusercontent.com" in t.get("url", "")]
    pool = google if google else thumbnails
    best = max(
        pool,
        key=lambda t: (t.get("width") or 0) * (t.get("height") or 0),
        default=pool[-1],
    )
    return upgrade_goog_url(best.get("url", ""))


def extract_chart_items(charts, limit: int = 30):
    """Normalizar respuesta de get_charts() a lista de canciones para la UI.

    Unifica 3 forks previos del parsing (warmup de main.py, /trending y
    /home/trending-fixed) y garantiza el MISMO shape en caché bajo la clave
    "trending" (antes warmup guardaba items crudos y /trending, ya parseados).
    """
    if not charts:
        return []

    candidates = []
    for key in (
        "songs",
        "topSongs",
        "trendingSongs",
        "trending",
        "videos",
        "topVideos",
    ):
        sec = charts.get(key)
        if not sec:
            continue
        items = sec.get("items") or sec.get("content") or []
        if items:
            candidates.extend(items)
            break
    if not candidates and isinstance(charts, list):
        candidates = charts
    if not candidates:
        for v in charts.values():
            if isinstance(v, dict):
                items = v.get("items") or v.get("content") or []
                if items and isinstance(items[0], dict) and items[0].get("videoId"):
                    candidates = items
                    break

    out = []
    for r in candidates[:limit]:
        vid = r.get("videoId") or r.get("id", "")
        if not vid:
            continue
        raw = r.get("artists") or r.get("artist") or []
        if isinstance(raw, str):
            artist_str = raw
        elif isinstance(raw, list):
            artist_str = ", ".join((a.get("name") or a) for a in raw if a)
        else:
            artist_str = ""
        out.append(
            {
                "videoId": vid,
                "title": r.get("title", ""),
                "artist": artist_str,
                "thumbnail": best_thumb(r.get("thumbnails", [])) or "",
                "duration": r.get("duration_seconds") or 0,
            }
        )
    return out


def best_thumb_raw(thumbnails) -> str:
    """Como best_thumb pero para covers de álbumes (ya HQ)."""
    if not thumbnails:
        return ""
    if isinstance(thumbnails, dict):
        thumbnails = thumbnails.get("thumbnails", [thumbnails])
    if not isinstance(thumbnails, list) or not thumbnails:
        return ""
    google = [t for t in thumbnails if "googleusercontent.com" in t.get("url", "")]
    pool = google if google else thumbnails
    best_val = max(
        pool,
        key=lambda t: (t.get("width") or 0) * (t.get("height") or 0),
        default=pool[-1],
    )
    return upgrade_goog_url(best_val.get("url", ""))


def fmt_thumbs(thumbnails) -> list:
    """Construir array de thumbnails [{url, width, height}] para srcset.

    Para googleusercontent.com:
        Genera 5 tamaños: 120, 226, 576, 1200, 2048 (HD para 4K).

    Para ytimg.com:
        Extrae el videoId de la URL y genera los 4 formatos estándar
        de YouTube: maxresdefault (HD), sddefault, hqdefault, mqdefault.
    """
    if not thumbnails:
        return []
    if isinstance(thumbnails, dict):
        thumbnails = thumbnails.get("thumbnails", [thumbnails])
    if not isinstance(thumbnails, list):
        return []

    google = [
        t
        for t in thumbnails
        if isinstance(t, dict) and "googleusercontent.com" in t.get("url", "")
    ]
    ytimg = [
        t for t in thumbnails if isinstance(t, dict) and "ytimg.com" in t.get("url", "")
    ]

    if google:
        base_url = google[-1].get("url", "").split("=")[0]
        return [
            {"url": f"{base_url}=w120-h120-l90-rj", "width": 120, "height": 120},
            {"url": f"{base_url}=w226-h226-l90-rj", "width": 226, "height": 226},
            {"url": f"{base_url}=w576-h576-l90-rj", "width": 576, "height": 576},
            {"url": f"{base_url}=w1200-h1200-l90-rj", "width": 1200, "height": 1200},
            {"url": f"{base_url}=w2048-h2048-l90-rj", "width": 2048, "height": 2048},
        ]
    elif ytimg:
        # Extraer videoId de cualquier URL de ytimg
        # Patrón: https://i.ytimg.com/vi/{videoId}/...
        vid = None
        for t in ytimg:
            m = re.search(r"/vi/([a-zA-Z0-9_-]+)/", t.get("url", ""))
            if m:
                vid = m.group(1)
                break

        if vid:
            return [
                {
                    "url": f"https://i.ytimg.com/vi/{vid}/maxresdefault.jpg",
                    "width": 1280,
                    "height": 720,
                },
                {
                    "url": f"https://i.ytimg.com/vi/{vid}/sddefault.jpg",
                    "width": 640,
                    "height": 480,
                },
                {
                    "url": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                    "width": 480,
                    "height": 360,
                },
                {
                    "url": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg",
                    "width": 320,
                    "height": 180,
                },
            ]

        # Fallback: pasar los originales sin modificar
        seen, out = set(), []
        for t in sorted(ytimg, key=lambda x: x.get("width") or 0):
            u = t.get("url", "")
            if u and u not in seen:
                seen.add(u)
                out.append(
                    {
                        "url": u,
                        "width": t.get("width") or 0,
                        "height": t.get("height") or 0,
                    }
                )
        return out
    return []


def parse_duration(d) -> int:
    """Convertir duración a segundos."""
    if not d:
        return 0
    if isinstance(d, int):
        return d
    parts = str(d).split(":")
    try:
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except Exception:
        pass
    return 0


def clean_artist_name(name: str) -> bool:
    """Verificar si es un nombre de artista real (no play count)."""
    if not name:
        return False
    if re.search(r"\d+[KMB]?\s*(plays|vistas|reproducciones)", name, re.I):
        return False
    return not re.match(r"^[\d.,]+[KMB]?$", name.strip())


def fmt_song(r: dict) -> dict:
    """Normalizar canción desde respuesta de YTMusic."""
    vid = r.get("videoId", "")
    raw_artists = r.get("artists") or []
    if isinstance(raw_artists, list):
        artist_str = ", ".join(
            a["name"]
            for a in raw_artists
            if isinstance(a, dict) and clean_artist_name(a.get("name", ""))
        )
    elif isinstance(raw_artists, str):
        artist_str = raw_artists if clean_artist_name(raw_artists) else ""
    else:
        artist_str = ""

    album = r.get("album") or {}
    raw_thumbs = r.get("thumbnails") or r.get("thumbnail") or []
    thumbs = fmt_thumbs(raw_thumbs)

    return {
        "videoId": vid,
        "title": r.get("title", "Sin título"),
        "artist": artist_str or "Desconocido",
        "album": album.get("name", "") if isinstance(album, dict) else "",
        "albumBrowseId": album.get("id", "") if isinstance(album, dict) else "",
        "artistBrowseId": (
            (r.get("artists") or [{}])[0].get("id", "")
            if isinstance(r.get("artists", []), list) and r.get("artists")
            else ""
        ),
        "thumbnail": thumbs[-1]["url"] if thumbs else best_thumb(raw_thumbs),
        "thumbnails": thumbs,
        "duration": r.get("duration_seconds") or parse_duration(r.get("duration")),
        "downloaded": get_mp3_path(vid).exists(),
    }


def get_mp3_path(video_id: str) -> Path:
    """Ruta al archivo MP3 descargado.

    Valida video_id antes de construir la ruta: defensa en profundidad
    contra path traversal en cualquier punto que construya rutas de archivo.
    """
    if not is_valid_video_id(video_id):
        raise ValueError(f"video_id inválido: {video_id!r}")
    return MUSIC_DIR / f"{video_id}.mp3"


def fmt_num(val) -> str:
    """Formatear número grande (ej: 1.5M, 2.3K)."""
    if not val:
        return ""
    try:
        n = int(str(val).replace(",", "").replace(".", ""))
        if n >= 1_000_000_000:
            return f"{n / 1_000_000_000:.1f}B"
        if n >= 1_000_000:
            return f"{n / 1_000_000:.1f}M"
        if n >= 1_000:
            return f"{n / 1_000:.1f}K"
        return str(n)
    except Exception:
        return str(val)
