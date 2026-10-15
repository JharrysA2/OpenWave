"""OpenWave Backend — Rutas del vídeo de fondo de la pantalla de letras."""

import asyncio
import json
import threading

from cache import video_progress
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from logging_config import get_logger
from range_utils import range_file_response
from rate_limit import limiter
from video_fondo import (
    delete_video,
    get_output_path,
    is_prepared,
    prepare_video,
    sin_videoclip,
)

from utils import require_valid_video_id

logger = get_logger(__name__)

router = APIRouter()

# Tope del SSE de progreso: un vídeo grande tarda más que un MP3, pero
# tampoco puede quedar abierto para siempre (mismo fallo que el SSE de
# descargas: spinner infinito si yt-dlp se cuelga).
_SSE_MAX_SECONDS = 900.0


def _mime_for(path) -> str:
    if path.suffix == ".webm":
        return "video/webm"
    return "video/mp4"


@router.post("/video/prepare/{video_id}")
@limiter.limit("5/minute")
async def prepare_background_video(request: Request, video_id: str, oficial: int = 1):
    """Iniciar la preparación del vídeo (descarga + mux) en background.

    ``oficial=0`` desactiva la búsqueda del videoclip oficial: se descarga el
    vídeo de la canción, como antes del ajuste.
    """
    require_valid_video_id(video_id)
    if is_prepared(video_id):
        return {"ok": True, "already": True}
    thread = threading.Thread(
        target=prepare_video, args=(video_id, bool(oficial)), daemon=True
    )
    thread.start()
    return {"ok": True}


@router.get("/video/progress/{video_id}")
async def video_progress_route(video_id: str):
    """SSE con el progreso de la preparación del vídeo."""
    require_valid_video_id(video_id)

    async def event_stream():
        elapsed = 0.0
        while True:
            progress = video_progress.get(
                video_id, {"status": "downloading", "progress": 0}
            )
            yield f"data: {json.dumps(progress)}\n\n"
            if progress.get("status") in ("done", "error", "sin_video"):
                break
            if elapsed >= _SSE_MAX_SECONDS:
                # Cerrar con error explícito: la preparación puede seguir en
                # su thread, pero la conexión no puede quedar abierta.
                yield 'data: {"status": "error", "error": "timeout"}\n\n'
                break
            await asyncio.sleep(0.5)
            elapsed += 0.5

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/video/status/{video_id}")
async def video_status(video_id: str, oficial: int = 1):
    """¿Está ya preparado el vídeo de esta canción?

    Con ``oficial=1`` (por defecto) se informa además de si la canción está
    resuelta como «sin videoclip oficial»: la pantalla se queda entonces con
    la portada y no se prepara nada.
    """
    require_valid_video_id(video_id)
    if is_prepared(video_id):
        return {"prepared": True}
    return {
        "prepared": False,
        "sin_videoclip": bool(oficial) and sin_videoclip(video_id),
    }


@router.get("/video/file/{video_id}")
async def video_file(request: Request, video_id: str):
    """Servir el vídeo preparado (con soporte de rangos para poder buscar)."""
    require_valid_video_id(video_id)
    path = get_output_path(video_id)
    if path is None:
        raise HTTPException(404, "Vídeo no preparado")
    return range_file_response(path, _mime_for(path), request.headers.get("range"))


@router.delete("/video/{video_id}")
@limiter.limit("10/minute")
async def video_delete(request: Request, video_id: str):
    """Eliminar el vídeo preparado (libera espacio en disco)."""
    require_valid_video_id(video_id)
    delete_video(video_id)
    video_progress.pop(video_id, None)
    return {"ok": True}
