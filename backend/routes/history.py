"""SoundWave Backend — Rutas de historial."""

import asyncio

from db import db_get_history, db_log_history, get_db
from fastapi import APIRouter, Query, Request

router = APIRouter()


@router.get("/history")
async def get_history(limit: int = Query(100, ge=1, le=500)):
    """Obtener historial de reproducción."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, db_get_history, limit)


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
