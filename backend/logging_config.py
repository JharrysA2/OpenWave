"""SoundWave Backend — Configuración centralizada de logging."""

import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from config import DATA_DIR

_LOG_FORMAT = "[%(levelname)s] %(asctime)s %(name)s → %(message)s"
_DATE_FORMAT = "%H:%M:%S"

# En desarrollo el log sigue en `backend/soundwave.log`; en la instalación
# (código en Program Files, no escribible) cae en `%LOCALAPPDATA%\SoundWave`.
# `SOUNDWAVE_LOG_FILE` permite redirigirlo (depuración, tests, portable).
_env_log = os.environ.get("SOUNDWAVE_LOG_FILE")
LOG_FILE = Path(_env_log) if _env_log else DATA_DIR / "soundwave.log"

_LOGGERS: dict[str, logging.Logger] = {}


def get_logger(name: str) -> logging.Logger:
    """Obtener o crear un logger con formato consistente.

    Escribe a consola y, en paralelo, al log de la app con rotación
    (1 MB, 3 backups). Pensado para diagnosticar fallos en la app instalada
    donde no hay terminal visible.
    """
    if name in _LOGGERS:
        return _LOGGERS[name]

    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)

    if not logger.handlers:
        fmt = logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT)

        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            LOG_FILE, maxBytes=1_000_000, backupCount=3, encoding="utf-8"
        )
        file_handler.setLevel(logging.INFO)
        file_handler.setFormatter(fmt)
        logger.addHandler(file_handler)

        stream_handler = logging.StreamHandler(sys.stdout)
        stream_handler.setLevel(logging.INFO)
        stream_handler.setFormatter(fmt)
        logger.addHandler(stream_handler)

    _LOGGERS[name] = logger
    return logger
