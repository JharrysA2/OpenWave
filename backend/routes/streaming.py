"""SoundWave Backend — Rutas de streaming de audio."""

import asyncio

from downloads import get_mp3_path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from logging_config import get_logger
from streaming import get_audio_url, prefetch, stream_audio_generator

from utils import require_valid_video_id

logger = get_logger(__name__)

router = APIRouter()


@router.get("/stream-url/{video_id}")
async def stream_url(video_id: str):
    """Obtener URL de streaming para reproducción."""
    require_valid_video_id(video_id)
    try:
        url, headers = await get_audio_url(video_id)
        return {"url": url, "headers": headers, "duration": 0}
    except Exception as e:
        raise HTTPException(500, f"Error al obtener stream: {e}") from e


@router.get("/stream/play/{video_id}")
async def stream_play(video_id: str):
    """Proxy de audio: descarga con yt-dlp y streamea al frontend.

    Usa yt-dlp subprocess directamente (no httpx) para evitar HTTP 403 de
    YouTube CDN. yt-dlp maneja cookies, headers y firmas de URL correctamente.
    El audio se streamea por chunks de 64KB para baja latencia.
    """
    require_valid_video_id(video_id)
    try:
        return StreamingResponse(
            stream_audio_generator(video_id),
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
async def prefetch_stream(video_id: str):
    """Pre-cargar URL de stream en caché."""
    require_valid_video_id(video_id)
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, prefetch, video_id)
    return {"ok": True}
