"""SoundWave Backend — Configuración y paths."""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
PROJECT_DIR = BASE_DIR.parent

# Cargar .env desde la raíz del proyecto (si existe; no en la instalación)
load_dotenv(PROJECT_DIR / ".env")


def _dir_escribible(path: Path) -> bool:
    """¿Se puede crear un archivo dentro de `path`?

    Se comprueba escribiendo de verdad en el ancestro existente más cercano:
    en Windows `os.access` miente con las ACLs de Program Files y con
    directorios que aún no existen.
    """
    probe_dir = path
    while not probe_dir.exists() and probe_dir != probe_dir.parent:
        probe_dir = probe_dir.parent
    try:
        probe_dir.mkdir(parents=True, exist_ok=True)
        probe = probe_dir / f".soundwave-write-test-{os.getpid()}"
        probe.write_text("", encoding="utf-8")
        probe.unlink()
        return True
    except OSError:
        return False


def _datos_dir() -> Path:
    """Directorio de datos de la aplicación.

    - `SOUNDWAVE_DATA_DIR` (variable de entorno o `.env`) manda siempre:
      lo usan tests, depuración y quien quiera mover las descargas.
    - En desarrollo (código en un repo, escribible) los datos van junto al
      código, como siempre: `backend/downloads`, `backend/soundwave.db`, etc.
    - En la instalación de Windows el código vive en `Program Files` (no
      escribible) y los datos pasan a `%LOCALAPPDATA%\\SoundWave`: descargas,
      cubiertos, letras, caché de stream, base de datos y log. Así la app
      funciona sin privilegios y sobrevive a desinstalar/reinstalar.
    """
    env = os.environ.get("SOUNDWAVE_DATA_DIR")
    if env:
        return Path(env)

    if _dir_escribible(BASE_DIR):
        return BASE_DIR

    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA") or str(
            Path.home() / "AppData" / "Local"
        )
        return Path(base) / "SoundWave"

    base = os.environ.get("XDG_DATA_HOME") or str(
        Path.home() / ".local" / "share"
    )
    return Path(base) / "SoundWave"


DATA_DIR = _datos_dir()

# Directorios de datos
MUSIC_DIR = DATA_DIR / "downloads"
COVERS_DIR = MUSIC_DIR / "covers"
LYRICS_DIR = DATA_DIR / "lyrics"
DB_FILE = DATA_DIR / "soundwave.db"
URL_CACHE_FILE = DATA_DIR / "url_cache.json"
# Audio re-codificado para "Calidad de reproducción: Baja" (~64 kb/s).
# Es una caché derivada (se puede regenerar), NO son las descargas del usuario.
STREAM_CACHE_DIR = DATA_DIR / "stream_cache"

# Crear directorios si no existen
MUSIC_DIR.mkdir(parents=True, exist_ok=True)
COVERS_DIR.mkdir(parents=True, exist_ok=True)
LYRICS_DIR.mkdir(parents=True, exist_ok=True)
STREAM_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# TTLs de caché
CACHE_TTL = 6 * 3600  # 6 horas para URLs de stream
API_CACHE_TTL = 600  # 10 min para respuestas de API
TRENDING_TTL = 1800  # 30 min para tendencias

# Tope de la caché de baja calidad (poda LRU por fecha de modificación)
STREAM_CACHE_MAX_BYTES = 512 * 1024 * 1024  # 512 MB

# Puerto del servidor
API_PORT = 8765
API_HOST = "127.0.0.1"
API_BASE = f"http://{API_HOST}:{API_PORT}"
