"""SoundWave Backend — Rutas de streaming de audio."""

import asyncio

from downloads import get_mp3_path
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from logging_config import get_logger
from streaming import (
    ensure_low_quality_sync,
    get_audio_url,
    prefetch,
    sanitize_quality,
    stream_audio_generator,
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
async def stream_quality_low(video_id: str):
    """Audio re-codificado a ~64 kb/s (Ajustes → Calidad de reproducción: Baja).

    Bloquea hasta tener el archivo (lo construye una sola vez, con
    coordinación entre threads) y luego lo entrega completo, igual que las
    descargas locales.
    """
    require_valid_video_id(video_id)
    loop = asyncio.get_running_loop()
    try:
        path = await loop.run_in_executor(None, ensure_low_quality_sync, video_id)
    except Exception as e:
        raise HTTPException(502, f"Audio en baja calidad no disponible: {e}") from e
    if not path.exists():
        raise HTTPException(404, "Archivo no encontrado")
    return FileResponse(str(path), media_type="audio/mp4")


@router.get("/stream/exists/{video_id}")
async def stream_exists(video_id: str):
    """¿Existe ya el MP3 local? (Calidad Alta: esperar a que termine la descarga)."""
    require_valid_video_id(video_id)
    return {"exists": get_mp3_path(video_id).exists()}


@router.get("/stream/play/{video_id}")
async def stream_play(video_id: str, quality: str = "standard"):
    """Proxy de audio: descarga con yt-dlp y streamea al frontend.

    Usa yt-dlp subprocess directamente (no httpx) para evitar HTTP 403 de
    YouTube CDN. yt-dlp maneja cookies, headers y firmas de URL correctamente.
    El audio se streamea por chunks de 64KB para baja latencia.
    """
    require_valid_video_id(video_id)
    try:
        return StreamingResponse(
            stream_audio_generator(video_id, quality),
            media_type="audio/mp4",
            headers={
                "Cache-Control": "no-cache",
                "Access-Control-Allow-Origin": "*",
                "X-Content-Type-Options": "nosniff",
            },
        )
    except Exception as e:
        logger.error("proxy audio %s: %s", video_id, e)
        raise HTTPException(502, f"Error al proxear audio: {e}") from e


@router.get("/stream/{video_id}")
async def stream_file(video_id: str):
    """Servir archivo MP3 descargado."""
    require_valid_video_id(video_id)
    mp3_path = get_mp3_path(video_id)
    if not mp3_path.exists():
        raise HTTPException(404, "Archivo no encontrado")
    return FileResponse(str(mp3_path), media_type="audio/mpeg")


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
