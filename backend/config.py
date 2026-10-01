"""OpenWave Backend — Configuración y paths."""

import os
import sys
from collections.abc import Mapping
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
PROJECT_DIR = BASE_DIR.parent

# Cargar .env desde la raíz del proyecto (si existe; no en la instalación)
load_dotenv(PROJECT_DIR / ".env")


def _dir_escribible(path: Path) -> bool:
    """¿Se puede crear y escribir dentro de `path`?

    Crea `path` (y sus padres) si falta y comprueba la escritura de verdad
    dentro: en Windows `os.access` miente con las ACLs de Program Files y
    con directorios que aún no existen.
    """
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError:
        # Ni siquiera se puede crear el directorio (ancestro que es un
        # fichero, sin permisos, unidad de solo lectura…).
        return False
    try:
        probe = path / f".openwave-write-test-{os.getpid()}"
        probe.write_text("", encoding="utf-8")
        probe.unlink()
        return True
    except OSError:
        return False


def _es_instalado(base_dir: Path, es_windows: bool) -> bool:
    """¿`base_dir` pertenece a una INSTALACIÓN de Windows (no al repo)?

    Solo en Windows deciden estas marcas (el repo jamás las cumple):

    * la ruta contiene `Program Files` / `Program Files (x86)`;
    * hay un hermano `runtime\\` junto a `backend\\` (solo el empaquetado
      tiene `backend\\` + `runtime\\` + `ffmpeg\\`).

    Por qué no basta con «no escribible»: al arrancar la app desde la
    última página del instalador el proceso hereda token elevado y la
    carpeta del código SÍ resulta escribible, con lo que la base de datos
    y las descargas acababan en «Archivos de programa» (espejo de
    `lib.rs::es_instalado`).
    """
    if not es_windows:
        return False
    ruta = str(base_dir).lower()
    if "\\program files\\" in ruta or "\\program files (x86)\\" in ruta:
        return True
    return (base_dir.parent / "runtime").exists()


def _resolver_datos_dir(
    base_dir: Path, entorno: Mapping[str, str], es_windows: bool
) -> Path:
    """Elegir la raíz de datos a partir del entorno (ver `_datos_dir`).

    Separado de la lectura real del proceso para poder testear la rama de
    Windows («Datos de Programas») también en Linux, sin tocar `os.name`
    (pathlib se rompería) ni el entorno global.
    """
    env = entorno.get("OPENWAVE_DATA_DIR")
    if env:
        return Path(env)

    if not _es_instalado(base_dir, es_windows) and _dir_escribible(base_dir):
        return base_dir

    if es_windows:
        # «Datos de Programas»: raíz compartida por la máquina, no depende
        # del usuario y sobrevive a desinstalar/reinstalar. Solo si se puede
        # crear y escribir de verdad (_dir_escribible crea la carpeta).
        program_data = entorno.get("PROGRAMDATA")
        if program_data:
            candidato = Path(program_data) / "OpenWave"
            if _dir_escribible(candidato):
                return candidato
        # Fallback por usuario: funciona sin privilegios.
        base = entorno.get("LOCALAPPDATA") or str(
            Path.home() / "AppData" / "Local"
        )
        return Path(base) / "OpenWave"

    base = entorno.get("XDG_DATA_HOME") or str(
        Path.home() / ".local" / "share"
    )
    return Path(base) / "OpenWave"


def _datos_dir() -> Path:
    """Directorio de datos de la aplicación.

    - `OPENWAVE_DATA_DIR` (variable de entorno o `.env`) manda siempre:
      lo usan tests, depuración y quien quiera mover las descargas.
    - En desarrollo (código en un repo, escribible) los datos van junto al
      código, como siempre: `backend/downloads`, `backend/openwave.db`, etc.
    - En la instalación de Windows los datos van a «Datos de Programas»,
      `%PROGRAMDATA%\\OpenWave`: descargas, cubiertos, letras, caché de
      stream, base de datos y log. Así comparten raíz con el resto de
      programas, no dependen de la cuenta y sobreviven a desinstalar y
      reinstalar la app. La instalación se reconoce por el layout (ruta en
      `Program Files` o hermano `runtime\\`, ver `_es_instalado`), NO por
      la escritura: el arranque elevado desde el instalador haría que el
      código pareciera escribible y los datos acabarían en «Archivos de
      programa».
    - Si ProgramData no estuviera disponible/escribible, a
      `%LOCALAPPDATA%\\OpenWave` (fallo sin privilegios).
    - En el resto de sistemas, a XDG (`$XDG_DATA_HOME/OpenWave`).
    """
    return _resolver_datos_dir(BASE_DIR, os.environ, es_windows=os.name == "nt")


DATA_DIR = _datos_dir()

# Directorios de datos
MUSIC_DIR = DATA_DIR / "downloads"
COVERS_DIR = MUSIC_DIR / "covers"
LYRICS_DIR = DATA_DIR / "lyrics"
DB_FILE = DATA_DIR / "openwave.db"
URL_CACHE_FILE = DATA_DIR / "url_cache.json"
# Audio re-codificado para "Calidad de reproducción: Baja" (~64 kb/s).
# Es una caché derivada (se puede regenerar), NO son las descargas del usuario.
STREAM_CACHE_DIR = DATA_DIR / "stream_cache"

# Caché de yt-dlp (respuestas de extractor, nsig…). También caché derivada y
# también dentro del directorio de datos: sin esto, yt-dlp la escribiría en
# `%USERPROFILE%\.cache\yt-dlp` (o `$XDG_CACHE_HOME`), fuera de la raíz de
# la aplicación.
YT_DLP_CACHE_DIR = DATA_DIR / "yt-dlp-cache"

# Crear directorios si no existen. Un fallo de permisos aquí NO debe tumbar
# el import entero: mejor degradar (la app arranca y avisará al escribir)
# antes que dejar el backend sin arrancar ni siquiera para mostrar el error.
for _dir in (MUSIC_DIR, COVERS_DIR, LYRICS_DIR, STREAM_CACHE_DIR, YT_DLP_CACHE_DIR):
    try:
        _dir.mkdir(parents=True, exist_ok=True)
    except OSError as _e:
        print(
            f"[openwave] No se pudo crear el directorio de datos {_dir}: {_e}",
            file=sys.stderr,
        )

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
