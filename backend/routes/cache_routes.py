"""SoundWave Backend — Cachés del reproductor (stats + limpieza)."""

from cache import api_cache, save_url_cache, stream_cache, url_disk_cache
from config import URL_CACHE_FILE
from fastapi import APIRouter, Request
from logging_config import get_logger
from rate_limit import limiter

logger = get_logger(__name__)

router = APIRouter()


@router.get("/cache/stats")
async def cache_stats():
    """Tamaño de las cachés del reproductor (streaming + API)."""
    bytes_on_disk = URL_CACHE_FILE.stat().st_size if URL_CACHE_FILE.exists() else 0
    return {
        "stream": len(stream_cache),
        "api": len(api_cache),
        "disk": len(url_disk_cache),
        "bytes": bytes_on_disk,
    }


@router.post("/cache/clear")
@limiter.limit("10/minute")
async def cache_clear(request: Request):
    """Vaciar todas las cachés: URLs de streaming, respuestas de API y el
    volcado a disco (url_cache.json). La próxima canción extrae URL de nuevo."""
    n = len(stream_cache) + len(api_cache) + len(url_disk_cache)
    stream_cache.clear()
    api_cache.clear()
    url_disk_cache.clear()
    save_url_cache()  # vuelca {} a url_cache.json (fuente de verdad en disco)
    logger.info("cache cleared: %d entries dropped", n)
    return {"ok": True, "stream": 0, "api": 0, "disk": 0}
