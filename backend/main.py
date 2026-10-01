"""
OpenWave Backend — FastAPI + ytmusicapi + yt-dlp
Entry point delgado que importa y monta todos los módulos.
"""

import asyncio
import contextlib
import json
import os
import re
import socket
import sys
import threading
import time

# ── Bootstrap de sys.path ────────────────────────────────────────────────────
# El Python embebido de Windows lleva un `python314._pth` que SUSTITUYE la
# inicialización normal de sys.path: solo quedan `python314.zip`, la carpeta
# del runtime y `Lib\site-packages`. Ni la carpeta del script (`sys.path[0]`)
# ni el cwd entran, así que estos imports planos de abajo morirían con
# `ModuleNotFoundError: No module named 'cache'` en la app instalada: era el
# bug que dejaba el backend del MSI muerto. Se añade la carpeta de este
# fichero antes de cualquier import: sirve para el runtime embebido (app
# instalada y `tauri dev`), para el venv de desarrollo y con cualquier cwd;
# Tauri lanza esto con rutas `\\?\` y también funcionan.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# stdio: en la app instalada Tauri redirige stdout/stderr del backend a
# backend.err.log, y Python abre esos flujos con la codificación de la locale
# (cp1252 en Windows), que no sabe escribir el '→' del formato de logging.
# El error saltaba DENTRO del handler y ensuciaba backend.err.log con un
# "Logging error" por cada registro nuestro (la app funcionaba, pero el
# fichero que sirve para diagnosticar quedaba inutilizable). UTF-8 con
# errors="replace" hace ese fallo imposible; en consola interactiva el flujo
# ya es UTF-8 y no cambia nada.
for _stream in (sys.stdout, sys.stderr):
    _reconf = getattr(_stream, "reconfigure", None)
    if callable(_reconf):
        # Un flujo raro (cerrado, capturado por los tests) no debe tumbar el
        # arranque: si no se puede reconfigurar, se escribe como hasta ahora.
        with contextlib.suppress(Exception):
            _reconf(encoding="utf-8", errors="replace")

import httpx
from cache import api_cache_get, api_cache_set
from config import API_HOST, API_PORT, BASE_DIR, MUSIC_DIR
from db import init_db
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.utils import is_body_allowed_for_status_code
from logging_config import get_logger
from rate_limit import limiter
from routes import api_router
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = get_logger(__name__)

# Orígenes permitidos (webview de Tauri + dev server de Vite). En un solo
# sitio: lo usa el middleware CORS y el handler de errores internos (ver abajo).
#
# CRÍTICO: la app EMPAQUETADA en Windows corre en WebView2 sobre
# `http://tauri.localhost` (visible en el perfil: Local Storage leveldb usa
# `_http://tauri.localhost`). Sin ese origen el fetch SÍ llega al backend y
# contesta 200, pero el navegador bloquea la lectura de la respuesta →
# TypeError en api.js → siempre «E-CNX-01» CON el backend en marcha (fallo
# visto en las dos primeras pruebas del MSI instalado).
_ORIGENES_CORS = (
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
    "http://localhost:1420",
    "http://127.0.0.1:1420",
)

# ── Inicialización de la app ──────────────────────────────────────────────────
app = FastAPI(title="OpenWave")
app.state.limiter = limiter

# ── Errores con código para el frontend ───────────────────────────────────────
# Todo error que sale del backend lleva además un `code` estable (p. ej.
# E-INT-00) que el frontend muestra y el usuario puede citar al reportar el
# problema: sin él hay que copiar mensajes y estados HTTP a mano.
CODIGOS_ERROR = {
    400: "E-REQ-01",  # petición malformada
    401: "E-REQ-02",  # no autenticado
    403: "E-REQ-02",  # prohibido
    404: "E-REQ-03",  # no encontrado
    429: "E-REQ-04",  # demasiadas peticiones
    500: "E-INT-00",  # error interno
    502: "E-SRV-01",  # servicio externo no disponible
    503: "E-SRV-01",  # servicio no disponible
}


def _codigo_error(status_code: int) -> str:
    """Código de error para un estado HTTP.

    Fuera del mapa: 4xx → E-REQ-01 (algo en la petición) y 5xx → E-SRV-01
    (el servicio no respondió), para que NUNCA haya un error sin código.
    """
    return CODIGOS_ERROR.get(status_code) or (
        "E-SRV-01" if status_code >= 500 else "E-REQ-01"
    )


async def _manejo_http_exception(request: Request, exc: HTTPException) -> Response:
    """HTTPException → payload de siempre (`detail`) + `code`."""
    headers = getattr(exc, "headers", None)
    if not is_body_allowed_for_status_code(exc.status_code):
        return Response(status_code=exc.status_code, headers=headers)
    return JSONResponse(
        {"detail": exc.detail, "code": _codigo_error(exc.status_code)},
        status_code=exc.status_code,
        headers=headers,
    )


async def _manejo_rate_limit(request: Request, exc: RateLimitExceeded) -> Response:
    """Rate limit de slowapi (429) → payload de siempre + `code`.

    slowapi responde con `{"error": ...}` y sus cabeceras de reintento: aquí
    solo se le inyecta el código, sin tocar lo demás.
    """
    response = _rate_limit_exceeded_handler(request, exc)
    try:
        payload = json.loads(response.body)
    except (TypeError, ValueError):
        return response
    if not isinstance(payload, dict):
        return response
    payload["code"] = _codigo_error(response.status_code)
    # content-length viejo: JSONResponse calcula el suyo con el cuerpo nuevo.
    headers = {
        k: v for k, v in response.headers.items() if k.lower() != "content-length"
    }
    return JSONResponse(payload, status_code=response.status_code, headers=headers)


async def _manejo_error_interno(request: Request, exc: Exception) -> Response:
    """Excepción no controlada → 500 con `code` y traceback en el log.

    El detalle es genérico a propósito (nada de rutas ni stacktrace al
    cliente); el detalle completo se queda en openwave.log / backend.err.log.
    """
    logger.error(
        "Error no controlado en %s %s: %s",
        request.method,
        request.url.path,
        exc,
        exc_info=exc,
    )
    # Este handler se ejecuta FUERA de CORSMiddleware (ServerErrorMiddleware
    # es el middleware más externo), así que sin repetir aquí las cabeceras
    # el webview no podría leer el cuerpo y se perdería el `code` justo en el
    # error que más interesa ver.
    headers = {}
    origen = request.headers.get("origin", "")
    if origen in _ORIGENES_CORS:
        headers = {
            "Access-Control-Allow-Origin": origen,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }
    return JSONResponse(
        {"detail": "Error interno del servidor", "code": "E-INT-00"},
        status_code=500,
        headers=headers,
    )


# Dos claves: los 404/405 los lanza Starlette con `starlette.HTTPException`
# (el router) y las rutas nuestras con `fastapi.HTTPException` (subclase de la
# anterior); sin las dos, unos errores se quedarían sin `code`.
app.add_exception_handler(HTTPException, _manejo_http_exception)
app.add_exception_handler(StarletteHTTPException, _manejo_http_exception)
app.add_exception_handler(RateLimitExceeded, _manejo_rate_limit)
app.add_exception_handler(Exception, _manejo_error_interno)

# Middleware — orden importante: GZip > CORS > Rate Limit
app.add_middleware(GZipMiddleware, minimum_size=800)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_ORIGENES_CORS),
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
    return {"status": "ok", "service": "OpenWave"}


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
    # 0,5 s de margen (antes 2 s): lo justo para que uvicorn termine de
    # levantarse; el warmup corre en hilo daemon y no bloquea nada.
    time.sleep(0.5)
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

    logger.info("🎵 OpenWave Backend — http://%s:%s", API_HOST, API_PORT)

    # Una sola instancia: si el puerto ya está ocupado, avisar claro y salir
    # (de otro modo uvicorn muere con un Errno crudo y sin contexto).
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind((API_HOST, API_PORT))
        except OSError:
            logger.error(
                "El puerto %s:%s ya está en uso — cierra la otra instancia de OpenWave e inténtalo de nuevo.",
                API_HOST,
                API_PORT,
            )
            sys.exit(1)

    # El objeto `app` y NO la cadena "main:app": como el script corre como
    # `__main__`, uvicorn re-importaría `main` y arrancaría TODO dos veces
    # (2× init_db, 2× warmup, 2× montar rutas) — el arranque lento se veía
    # sobre todo aquí.
    uvicorn.run(
        app,
        host=API_HOST,
        port=API_PORT,
        reload=False,
        log_level="info",
        # Sin access log: en la app instalada el stderr va a backend.err.log
        # y cada petición saturaría el fichero sin aportar nada (la app ya
        # loguea lo importante en openwave.log).
        access_log=False,
    )
