"""SoundWave Backend — Configuración centralizada de logging."""

import logging
import sys

_LOG_FORMAT = "[%(levelname)s] %(name)s → %(message)s"
_DATE_FORMAT = "%H:%M:%S"

_LOGGERS: dict[str, logging.Logger] = {}


def get_logger(name: str) -> logging.Logger:
    """Obtener o crear un logger con formato consistente."""
    if name in _LOGGERS:
        return _LOGGERS[name]

    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(logging.INFO)
        fmt = logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT)
        handler.setFormatter(fmt)
        logger.addHandler(handler)

    _LOGGERS[name] = logger
    return logger
