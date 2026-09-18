"""SoundWave Backend — Rutas de letras."""

from fastapi import APIRouter, Request
from lyrics import get_local_lyrics, search_lyrics
from lyrics import get_lyrics as lyrics_service
from rate_limit import limiter
from utils import require_valid_video_id

router = APIRouter()


@router.get("/lyrics/local/{video_id}")
async def lyrics_local(video_id: str):
    """Obtener letras locales (.lrc) de una canción descargada."""
    require_valid_video_id(video_id)
    return await get_local_lyrics(video_id)


@router.get("/lyrics/search")
@limiter.limit("15/minute")
async def lyrics_search(request: Request, title: str = "", artist: str = "", source: str = "lrclib"):
    """Buscar letras desde múltiples fuentes — 15 req/min."""
    return await search_lyrics(title, artist, source)


@router.get("/lyrics/{video_id}")
@limiter.limit("30/minute")
async def lyrics_get(request: Request, video_id: str, title: str = "", artist: str = ""):
    """Auto-fetch lyrics con múltiples fuentes — 30 req/min."""
    require_valid_video_id(video_id)
    return await lyrics_service(video_id, title, artist)
