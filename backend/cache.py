"""SoundWave Backend — Sistema de caché en memoria y disco."""

import json
import threading
import time
from contextlib import suppress

from config import API_CACHE_TTL, CACHE_TTL, URL_CACHE_FILE

# Cachés
stream_cache: dict = {}
url_disk_cache: dict = {}
api_cache: dict = {}
download_progress: dict = {}
in_flight: dict = {}
in_flight_lock = threading.Lock()


def load_url_cache():
    """Cargar caché de URLs desde disco."""
    global url_disk_cache
    if URL_CACHE_FILE.exists():
        try:
            data = json.loads(URL_CACHE_FILE.read_text("utf-8"))
            now = time.time()
            url_disk_cache = {
                k: tuple(v) for k, v in data.items() if now - v[2] < CACHE_TTL
            }
        except Exception:
            url_disk_cache = {}


def save_url_cache():
    """Guardar caché de URLs a disco (en background)."""
    with suppress(Exception):
        URL_CACHE_FILE.write_text(
            json.dumps(
                {k: list(v) for k, v in url_disk_cache.items()},
                ensure_ascii=False,
            ),
            "utf-8",
        )


def cache_url(video_id: str, url: str, headers: dict):
    """Guardar URL en caché (memoria + disco)."""
    now = time.time()
    stream_cache[video_id] = (url, headers, now)
    url_disk_cache[video_id] = (url, headers, now)
    threading.Thread(target=save_url_cache, daemon=True).start()


def get_cached_url(video_id: str):
    """Obtener URL cachead (memoria → disco)."""
    now = time.time()
    m = stream_cache.get(video_id)
    if m and now - m[2] < CACHE_TTL:
        return m[0], m[1]
    c = url_disk_cache.get(video_id)
    if c and now - c[2] < CACHE_TTL:
        return c[0], c[1]
    return None, None


def api_cache_get(key: str, ttl: int = API_CACHE_TTL):
    """Obtener valor de caché de API."""
    e = api_cache.get(key)
    if e and (time.time() - e[1]) < ttl:
        return e[0]
    return None


def api_cache_set(key: str, value, ttl: int = None):
    """Guardar valor en caché de API."""
    api_cache[key] = (value, time.time())


# Cargar caché de disco al importar
load_url_cache()
