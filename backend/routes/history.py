"""SoundWave Backend — Rutas de historial y estado del reproductor."""

from db import db_get_history, db_get_state, db_log_history, db_save_state, get_db
from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/history")
async def get_history(limit: int = 100):
    """Obtener historial de reproducción."""
    return db_get_history(limit)


@router.post("/history")
async def log_history(request: Request):
    """Registrar una reproducción en el historial."""
    body = await request.json()
    db_log_history(body)
    return {"ok": True}


@router.delete("/history")
async def delete_history_entries(request: Request):
    """Eliminar entradas específicas del historial."""
    body = await request.json()
    video_ids = body.get("videoIds", [])
    with get_db() as conn:
        for vid in video_ids:
            conn.execute("DELETE FROM history WHERE video_id=?", (vid,))
    return {"ok": True}


@router.delete("/history/all")
async def clear_history():
    """Limpiar todo el historial."""
    with get_db() as conn:
        conn.execute("DELETE FROM history")
    return {"ok": True}


@router.get("/player/state")
async def get_player_state():
    """Obtener estado guardado del reproductor."""
    return {
        "volume": db_get_state("volume", 0.7),
        "queue": db_get_state("queue", []),
        "lastSong": db_get_state("lastSong"),
        "shuffle": db_get_state("shuffle", False),
        "repeat": db_get_state("repeat", False),
    }


@router.post("/player/state")
async def save_player_state(request: Request):
    """Guardar estado del reproductor."""
    body = await request.json()
    for key, value in body.items():
        db_save_state(key, value)
    return {"ok": True}
