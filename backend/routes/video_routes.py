"""OpenWave Backend — Rutas del vídeo de fondo de la pantalla de letras."""

import asyncio
import json
import threading

from cache import video_progress
from config import VIDEO_CACHE_MAX_BYTES
from db import get_db
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from logging_config import get_logger
from range_utils import range_file_response
from rate_limit import limiter
from video_fondo import (
    calidad_suficiente,
    delete_all_videos,
    delete_video,
    desfase_guardado,
    get_output_path,
    listar_videos_cacheados,
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
async def prepare_background_video(
    request: Request, video_id: str, oficial: int = 1, max_alto: int | None = None
):
    """Iniciar la preparación del vídeo (descarga + mux) en background.

    ``oficial=0`` desactiva la búsqueda del videoclip oficial: se descarga el
    vídeo de la canción, como antes del ajuste.

    ``max_alto`` es la altura de la pantalla del cliente en píxeles físicos:
    el tope de resolución con el que se pide el vídeo (720–2160). Si el vídeo
    en disco se pidió con un tope menor, se vuelve a descargar con el nuevo;
    si alcanza o supera el tope pedido, se responde ``already`` como siempre.

    El progreso se limpia ANTES de lanzar el hilo: si el SSE se conecta justo
    después (que es lo que hace la pantalla), no debe leer el estado que
    dejó un intento anterior («error»/«sin_video») y cerrar el aviso en
    falso.
    """
    require_valid_video_id(video_id)
    if calidad_suficiente(video_id, max_alto):
        # Ya está: se marca «done» para que quien abra el SSE cierre enseguida.
        video_progress[video_id] = {"status": "done", "progress": 100, "error": None}
        return {"ok": True, "already": True}
    video_progress[video_id] = {"status": "downloading", "progress": 0, "error": None}
    thread = threading.Thread(
        target=prepare_video,
        args=(video_id, bool(oficial), max_alto),
        daemon=True,
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
async def video_status(video_id: str, oficial: int = 1, max_alto: int | None = None):
    """¿Está ya preparado el vídeo de esta canción?

    Con ``oficial=1`` (por defecto) se informa además de si la canción está
    resuelta como «sin videoclip oficial»: la pantalla se queda entonces con
    la portada y no se prepara nada.

    ``max_alto`` es la altura de la pantalla del cliente (el mismo valor que
    en /video/prepare): si el fichero en disco se pidió con un tope menor, se
    informa de «sin preparar» para que la pantalla lance la nueva descarga y
    el vídeo suba de resolución.

    Si está preparado se devuelve también el ``desfase`` medido con la
    canción (0.0 si no hizo falta medir): la pantalla lo usa para arrancar el
    vídeo por delante del audio cuando el videoclip lleva intro.
    """
    require_valid_video_id(video_id)
    if calidad_suficiente(video_id, max_alto):
        return {"prepared": True, "desfase": desfase_guardado(video_id)}
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


@router.get("/videos")
async def list_videos():
    """Listar los vídeos de fondo cacheados (para Almacenamiento).

    Cada entrada trae id, tamaño, fecha y resolución medida del fichero, más
    el título/artista de la canción resolviéndolo contra las tablas de la
    app (historial → descargas → playlists, la primera que lo tenga).
    """
    loop = asyncio.get_running_loop()

    def _read():
        canciones: dict = {}
        with get_db() as conn:
            for tabla in ("history", "downloads", "playlist_songs"):
                for r in conn.execute(
                    f"SELECT video_id, title, artist FROM {tabla}"
                ).fetchall():
                    canciones.setdefault(r["video_id"], (r["title"], r["artist"]))
        videos = listar_videos_cacheados()
        for v in videos:
            titulo, artista = canciones.get(v["videoId"], (None, None))
            v["title"] = titulo
            v["artist"] = artista
        return {
            "videos": videos,
            "total": sum(v["size"] for v in videos),
            "limit": VIDEO_CACHE_MAX_BYTES,
        }

    return await loop.run_in_executor(None, _read)


@router.delete("/videos")
@limiter.limit("10/minute")
async def clear_videos(request: Request):
    """Vaciar la caché de vídeos de fondo (devuelve cuánto se liberó)."""
    res = delete_all_videos()
    video_progress.clear()
    return {"ok": True, **res}
