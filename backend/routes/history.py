"""OpenWave Backend — Rutas de historial."""

import asyncio

from cache import api_cache_delete
from db import db_get_history, db_import_history, db_log_history, get_db
from fastapi import APIRouter, Query, Request

from utils import enrich_local_flags

router = APIRouter()


@router.get("/history")
async def get_history(limit: int = Query(100, ge=1, le=500)):
    """Obtener historial de reproducción."""
    loop = asyncio.get_running_loop()
    items = await loop.run_in_executor(None, db_get_history, limit)
    # downloaded/coverLocal: el historial reproduce el MP3 local (sin
    # streaming) y muestra la portada de disco cuando la canción ya está
    # descargada — también sin internet.
    enrich_local_flags(items)
    return items


@router.post("/history")
async def log_history(request: Request):
    """Registrar una reproducción en el historial."""
    body = await request.json()
    db_log_history(body)
    # El mix «Tu Mix del Momento» depende de las repeticiones recientes: al
    # registrar una reproducción, invalida el mix para que la próxima carga
    # recalcule la Canción Ancla al momento.
    api_cache_delete("home:for-you")
    return {"ok": True}


@router.delete("/history")
async def delete_history_entries(request: Request):
    """Eliminar entradas específicas del historial."""
    body = await request.json()
    video_ids = body.get("videoIds", [])
    with get_db() as conn:
        for vid in video_ids:
            conn.execute("DELETE FROM history WHERE video_id=?", (vid,))
            conn.execute("DELETE FROM play_events WHERE video_id=?", (vid,))
    api_cache_delete("home:for-you")
    return {"ok": True}


@router.post("/history/import")
async def import_history(request: Request):
    """Importar historial desde una copia de seguridad (fusión, sin duplicar)."""
    body = await request.json()
    entries = body.get("entries") or []
    if not isinstance(entries, list):
        entries = []
    imported = db_import_history(entries)
    return {"ok": True, "imported": imported}


@router.delete("/history/all")
async def clear_history():
    """Limpiar todo el historial."""
    with get_db() as conn:
        conn.execute("DELETE FROM history")
        conn.execute("DELETE FROM play_events")
    api_cache_delete("home:for-you")
    return {"ok": True}
