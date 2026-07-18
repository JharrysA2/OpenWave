"""SoundWave Backend — Cliente YTMusic singleton."""

import threading

from fastapi import HTTPException
from logging_config import get_logger
from ytmusicapi import YTMusic

logger = get_logger(__name__)

_ytm: YTMusic | None = None
_ytm_ready = threading.Event()


def _init_ytm():
    """Inicializar YTMusic en background thread."""
    global _ytm
    try:
        _ytm = YTMusic()
    except Exception as e:
        logger.error("ytm: %s", e)
    finally:
        _ytm_ready.set()


# Iniciar en thread separado
threading.Thread(target=_init_ytm, daemon=True).start()


def get_ytm() -> YTMusic:
    """Obtener instancia de YTMusic (espera hasta 8s si no está lista)."""
    _ytm_ready.wait(timeout=8)
    if _ytm is None:
        raise HTTPException(503, "YTMusic no disponible")
    return _ytm
