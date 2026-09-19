"""Configuración global de pytest para el backend SoundWave."""

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# ── Forzar rutas temporales antes de importar config ──────────────────────────
TMP_DIR = Path(tempfile.mkdtemp(prefix="sw_test_"))

# Sobrescribir paths de config antes de cualquier import del backend
import config as cfg  # noqa: E402

cfg.BASE_DIR = TMP_DIR
cfg.MUSIC_DIR = TMP_DIR / "downloads"
cfg.COVERS_DIR = TMP_DIR / "downloads" / "covers"
cfg.LYRICS_DIR = TMP_DIR / "downloads" / "lyrics"
cfg.DB_FILE = TMP_DIR / "soundwave.db"
cfg.URL_CACHE_FILE = TMP_DIR / "url_cache.json"
cfg.MUSIC_DIR.mkdir(parents=True, exist_ok=True)
cfg.COVERS_DIR.mkdir(parents=True, exist_ok=True)
cfg.LYRICS_DIR.mkdir(parents=True, exist_ok=True)


@pytest.fixture(autouse=True)
def _clean_cache():
    """Limpiar cachés antes de cada test."""
    from cache import api_cache, stream_cache, url_disk_cache

    api_cache.clear()
    stream_cache.clear()
    url_disk_cache.clear()
    yield


@pytest.fixture(autouse=True)
def _clean_feedback():
    """Limpiar tablas mutables antes de cada test para evitar interferencias.
    Todos los tests comparten la misma DB temporal: sin esta limpieza,
    filas de un test (ej: downloads) contaminan al siguiente.
    """
    from db import get_db, init_db

    init_db()  # Asegurar que las tablas existen (puede no haberse llamado aún)
    with get_db() as conn:
        conn.execute("DELETE FROM song_feedback")
        conn.execute("DELETE FROM downloads")
        conn.execute("DELETE FROM history")
        conn.execute("DELETE FROM playlist_songs")
        conn.execute("DELETE FROM playlists")
    yield


@pytest.fixture(autouse=True)
def _drain_db_pool():
    """Vaciar el pool de conexiones antes y después de cada test.

    get_db() ahora reutiliza conexiones de un pool; los tests que mockean
    sqlite3.connect esperan un pool vacío, y vaciar después libera el DB
    temporal entre tests.
    """
    from db import _drain_pool

    _drain_pool()
    yield
    _drain_pool()


@pytest.fixture
def client():
    """Cliente de prueba para la API de FastAPI."""
    from main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def sample_song():
    """Canción de muestra para tests."""
    return {
        "videoId": "test123",
        "title": "Canción de prueba",
        "artist": "Artista Test",
        "thumbnail": "https://lh3.googleusercontent.com/test=h120",
        "duration": 240,
        "album": "Álbum Test",
    }
