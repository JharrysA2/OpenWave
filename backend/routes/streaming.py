"""OpenWave Backend — Rutas de streaming de audio."""

import asyncio

from downloads import get_mp3_path
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from logging_config import get_logger
from range_utils import range_file_response
from streaming import (
    ensure_low_quality_sync,
    get_audio_url,
    prefetch,
    sanitize_quality,
    stream_audio_generator,
    upstream_range_stream,
    warm_low_quality,
)

from utils import require_valid_video_id

logger = get_logger(__name__)

router = APIRouter()


@router.get("/stream-url/{video_id}")
async def stream_url(request: Request, video_id: str, quality: str = "standard"):
    """Obtener URL de streaming para reproducción.

    ``quality`` (low/standard/high), normalizada con whitelist:
      - low → el M4A re-codificado local (~64 kb/s): esta petición responde ya
        con su URL y lanza la construcción en background; el archivo lo sirve
        GET /stream/quality/{id} cuando el navegador lo pide.
      - standard/high → URL directa de YouTube. «Alta» la usa como respaldo:
        el frontend primero intenta reproducir el MP3 local (descarga con la
        calidad de descarga) y solo cae aquí si no pudo.
    """
    require_valid_video_id(video_id)
    quality = sanitize_quality(quality)
    if quality == "low":
        warm_low_quality(video_id)
        base = str(request.base_url).rstrip("/")
        return {"url": f"{base}/stream/quality/{video_id}", "headers": {}, "duration": 0}
    try:
        url, headers = await get_audio_url(video_id, quality)
        return {"url": url, "headers": headers, "duration": 0}
    except Exception as e:
        raise HTTPException(500, f"Error al obtener stream: {e}") from e


@router.get("/stream/quality/{video_id}")
async def stream_quality_low(request: Request, video_id: str):
    """Audio re-codificado a ~64 kb/s (Ajustes → Calidad de reproducción: Baja).

    Bloquea hasta tener el archivo (lo construye una sola vez, con
    coordinación entre threads) y luego lo entrega honoreando ``Range``
    (206 + Content-Range → seekable en el navegador).
    """
    require_valid_video_id(video_id)
    loop = asyncio.get_running_loop()
    try:
        path = await loop.run_in_executor(None, ensure_low_quality_sync, video_id)
    except Exception as e:
        raise HTTPException(502, f"Audio en baja calidad no disponible: {e}") from e
    if not path.exists():
        raise HTTPException(404, "Archivo no encontrado")
    return range_file_response(str(path), "audio/mp4", request.headers.get("range"))


@router.get("/stream/exists/{video_id}")
async def stream_exists(video_id: str):
    """¿Existe ya el MP3 local? (Calidad Alta: esperar a que termine la descarga)."""
    require_valid_video_id(video_id)
    return {"exists": get_mp3_path(video_id).exists()}


@router.get("/stream/play/{video_id}")
async def stream_play(request: Request, video_id: str, quality: str = "standard"):
    """Proxy de audio con soporte de seek (HTTP Range).

    Estrategia (en orden):
      1. ``low`` → M4A local servido con 206/Content-Range.
      2. URL directa de YouTube pidiendo al upstream EXACTAMENTE el rango que
         envió el navegador (curl_cffi impersonate Chrome) → 206 real → el
         ``<audio>`` queda seekable y ``currentTime = t`` salta en vez de
         reiniciar la canción.
      3. Fallback yt-dlp subprocess (streaming a secas, sin seek honesto con
         ``Accept-Ranges: none``).
    """
    require_valid_video_id(video_id)
    quality = sanitize_quality(quality)
    range_header = request.headers.get("range")

    if quality == "low":
        try:
            loop = asyncio.get_running_loop()
            path = await loop.run_in_executor(None, ensure_low_quality_sync, video_id)
            if path.exists():
                return range_file_response(str(path), "audio/mp4", range_header)
        except Exception as e:
            logger.warning("proxy audio %s: baja no disponible (%s)", video_id, e)

    try:
        status, extra_headers, body = await upstream_range_stream(
            video_id, quality, range_header
        )
        return StreamingResponse(
            body,
            status_code=status,
            media_type="audio/mp4",
            headers={
                "Cache-Control": "no-cache",
                "Access-Control-Allow-Origin": "*",
                "X-Content-Type-Options": "nosniff",
                # Sin esto el GZipMiddleware comprime el stream: Content-Range
                # (upstream) dejaría de corresponderse con los bytes servidos.
                "Content-Encoding": "identity",
                **extra_headers,
            },
        )
    except Exception as e:
        logger.warning("proxy audio %s upstream falló (%s); yt-dlp", video_id, e)

    try:
        return StreamingResponse(
            stream_audio_generator(video_id, quality),
            media_type="audio/mp4",
            headers={
                "Cache-Control": "no-cache",
                "Access-Control-Allow-Origin": "*",
                "X-Content-Type-Options": "nosniff",
                "Content-Encoding": "identity",
                # Este fallback no puede servir rangos: ser honestos para que
                # Chromium no intente un seek que reiniciaría la reproducción.
                "Accept-Ranges": "none",
            },
        )
    except Exception as e:
        logger.error("proxy audio %s: %s", video_id, e)
        raise HTTPException(502, f"Error al proxear audio: {e}") from e


@router.get("/stream/{video_id}")
async def stream_file(request: Request, video_id: str):
    """Servir archivo MP3 descargado (con soporte HTTP Range → seekable)."""
    require_valid_video_id(video_id)
    mp3_path = get_mp3_path(video_id)
    if not mp3_path.exists():
        raise HTTPException(404, "Archivo no encontrado")
    return range_file_response(
        str(mp3_path), "audio/mpeg", request.headers.get("range")
    )


@router.get("/stream/prefetch/{video_id}")
async def prefetch_stream(video_id: str, quality: str = "standard"):
    """Pre-cargar URL de stream en caché (entrada propia por calidad).

    Con ``low`` calienta la construcción del M4A re-codificado en background.
    """
    require_valid_video_id(video_id)
    quality = sanitize_quality(quality)
    if quality == "low":
        warm_low_quality(video_id)
        return {"ok": True}
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, prefetch, video_id, quality)
    return {"ok": True}
