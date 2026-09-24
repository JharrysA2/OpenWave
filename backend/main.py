"""
SoundWave Backend — FastAPI + ytmusicapi + yt-dlp
Entry point delgado que importa y monta todos los módulos.
"""

import asyncio
import json
import os
import re
import socket
import sys
import threading
import time

import httpx
from cache import api_cache_get, api_cache_set
from config import API_HOST, API_PORT, BASE_DIR, MUSIC_DIR
from db import init_db
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from logging_config import get_logger
from rate_limit import limiter
from routes import api_router
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

logger = get_logger(__name__)

# ── Inicialización de la app ──────────────────────────────────────────────────
app = FastAPI(title="SoundWave")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Middleware — orden importante: GZip > CORS > Rate Limit
app.add_middleware(GZipMiddleware, minimum_size=800)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "tauri://localhost",
        "http://localhost:1420",
        "http://127.0.0.1:1420",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)
app.add_middleware(SlowAPIMiddleware)

# Inicializar base de datos
init_db()

# Montar rutas
app.include_router(api_router)

# Montar archivos estáticos (música descargada)
app.mount("/music", StaticFiles(directory=str(MUSIC_DIR)), name="music")


# ── Endpoints adicionales inline ──────────────────────────────────────────────


@app.get("/health")
@limiter.limit("120/minute")
async def health(request: Request):
    """Health check — 120 req/min para monitoreo."""
    return {"status": "ok", "service": "SoundWave"}


# ── Caché en memoria para thumbnail-proxy (TTL 10 min) ────────────────
#    Evita consumir el presupuesto de rate-limit con URLs repetidas.
#    Cuando el frontend abre una vista (álbum, artista), múltiples
#    componentes pueden solicitar el mismo thumbnail simultáneamente.
#    El caché sirve la respuesta sin llamar a Google/YouTube CDN.
_THUMB_CACHE = {}
_THUMB_CACHE_TTL = 600  # 10 minutos

# Whitelist de hosts permitidos (regex precompiladas para no compilar por request)
_THUMB_ALLOWED = [
    re.compile(r"^https://i\.ytimg\.com/"),
    re.compile(r"^https://lh3\.googleusercontent\.com/"),
    re.compile(r"^https://yt3\.googleusercontent\.com/"),
    re.compile(r"^https://music[\w-]*\.apple\.com/"),
    re.compile(r"^https://is[\d]-ssl\.mzstatic\.com/"),
]


@app.get("/thumbnail-proxy")
@limiter.limit("300/minute")
async def thumbnail_proxy(request: Request, url: str):
    """Proxy para thumbnails — 300 req/min.
    Cachea respuestas en el navegador por 7 días + caché en memoria 10 min.
    Solo permite URLs de YouTube, Google y servicios de imágenes conocidos.
    """
    if not any(p.match(url) for p in _THUMB_ALLOWED):
        return JSONResponse(
            status_code=403,
            content={"error": "URL no permitida"},
        )

    # ── Verificar caché en memoria ───────────────────────────────────────
    cached = _THUMB_CACHE.get(url)
    if cached and (time.time() - cached["ts"]) < _THUMB_CACHE_TTL:
        return Response(
            content=cached["data"],
            media_type=cached["mime"],
            headers={
                "Cache-Control": "public, max-age=604800, immutable",
                "Access-Control-Allow-Origin": "*",
                "X-Content-Type-Options": "nosniff",
            },
        )

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        resp = await client.get(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                "Referer": "https://music.youtube.com/",
            },
        )
        content_type = resp.headers.get("content-type", "image/jpeg")
        content = resp.content

        # Guardar en caché en memoria
        _THUMB_CACHE[url] = {"data": content, "mime": content_type, "ts": time.time()}
        # Limpiar cachés viejas si crece demasiado
        if len(_THUMB_CACHE) > 200:
            now = time.time()
            stale = [
                k for k, v in _THUMB_CACHE.items() if (now - v["ts"]) > _THUMB_CACHE_TTL
            ]
            for k in stale:
                del _THUMB_CACHE[k]

        return Response(
            content=content,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=604800, immutable",  # 7 días
                "Access-Control-Allow-Origin": "*",
                "X-Content-Type-Options": "nosniff",
            },
        )


def _startup_warmup():
    """Pre-cargar datos al iniciar."""
    time.sleep(2)
    try:
        from ytmusic_client import get_ytm

        from utils import extract_chart_items

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        charts = get_ytm().get_charts(country="GT")
        if charts:
            songs_data = extract_chart_items(charts, limit=30)
            if songs_data:
                api_cache_set("trending", songs_data)
                logger.info("warmup ✓ %d trending songs cached", len(songs_data))
    except Exception as e:
        logger.warning("warmup: %s", e)


threading.Thread(target=_startup_warmup, daemon=True).start()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    logger.info("🎵 SoundWave Backend — http://%s:%s", API_HOST, API_PORT)

    # Una sola instancia: si el puerto ya está ocupado, avisar claro y salir
    # (de otro modo uvicorn muere con un Errno crudo y sin contexto).
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind((API_HOST, API_PORT))
        except OSError:
            logger.error(
                "El puerto %s:%s ya está en uso — cierra la otra instancia de SoundWave e inténtalo de nuevo.",
                API_HOST,
                API_PORT,
            )
            sys.exit(1)

    uvicorn.run(
        "main:app",
        host=API_HOST,
        port=API_PORT,
        reload=False,
        log_level="info",
    )
