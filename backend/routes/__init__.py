"""SoundWave Backend — Agregador de rutas."""

from fastapi import APIRouter

from routes.downloads_routes import router as downloads_router
from routes.history import router as history_router
from routes.lyrics_routes import router as lyrics_router
from routes.playlists import router as playlists_router
from routes.search import router as search_router
from routes.songs import router as songs_router
from routes.streaming import router as streaming_router

api_router = APIRouter()
api_router.include_router(search_router)
api_router.include_router(songs_router)
api_router.include_router(streaming_router)
api_router.include_router(downloads_router)
api_router.include_router(playlists_router)
api_router.include_router(history_router)
api_router.include_router(lyrics_router)
