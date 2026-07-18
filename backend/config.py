"""SoundWave Backend — Configuración y paths."""

from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
PROJECT_DIR = BASE_DIR.parent

# Cargar .env desde la raíz del proyecto
load_dotenv(PROJECT_DIR / ".env")

# Directorios de datos
MUSIC_DIR = BASE_DIR / "downloads"
COVERS_DIR = BASE_DIR / "downloads" / "covers"
LYRICS_DIR = BASE_DIR / "downloads" / "lyrics"
DB_FILE = BASE_DIR / "soundwave.db"
URL_CACHE_FILE = BASE_DIR / "url_cache.json"

# Crear directorios si no existen
MUSIC_DIR.mkdir(exist_ok=True)
COVERS_DIR.mkdir(exist_ok=True)
LYRICS_DIR.mkdir(exist_ok=True)

# TTLs de caché
CACHE_TTL = 6 * 3600  # 6 horas para URLs de stream
API_CACHE_TTL = 600  # 10 min para respuestas de API
TRENDING_TTL = 1800  # 30 min para tendencias

# Puerto del servidor
API_PORT = 8765
API_HOST = "127.0.0.1"
API_BASE = f"http://{API_HOST}:{API_PORT}"
