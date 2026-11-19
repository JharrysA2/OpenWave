"""OpenWave Backend — Importación perezosa de módulos pesados.

``yt-dlp`` y ``httpx`` suman más de medio segundo al arranque, y el backend
tiene que servir ``/health`` antes de que la app pueda pintar nada. Cada
módulo que los usa crea un ``LazyModule``: el ``import`` real ocurre con el
primer atributo, no al cargar el backend.

El proxy delega también ``setattr``/``delattr`` en el módulo real, así que los
tests pueden seguir parcheando ``modulo.yt_dlp.YoutubeDL`` como siempre.
"""

from __future__ import annotations

import importlib
import threading


class LazyModule:
    """Proxy transparente que carga un módulo en el primer acceso."""

    def __init__(self, nombre: str):
        object.__setattr__(self, "_nombre", nombre)
        object.__setattr__(self, "_modulo", None)
        object.__setattr__(self, "_lock", threading.Lock())

    def _cargar(self):
        modulo = object.__getattribute__(self, "_modulo")
        if modulo is not None:
            return modulo
        with object.__getattribute__(self, "_lock"):
            modulo = object.__getattribute__(self, "_modulo")
            if modulo is None:
                modulo = importlib.import_module(
                    object.__getattribute__(self, "_nombre")
                )
                object.__setattr__(self, "_modulo", modulo)
        return modulo

    def __getattr__(self, nombre):
        return getattr(self._cargar(), nombre)

    def __setattr__(self, nombre, valor):
        setattr(self._cargar(), nombre, valor)

    def __delattr__(self, nombre):
        delattr(self._cargar(), nombre)

    def __dir__(self):
        return dir(self._cargar())

    def __repr__(self):
        nombre = object.__getattribute__(self, "_nombre")
        estado = (
            "cargado"
            if object.__getattribute__(self, "_modulo") is not None
            else "sin cargar"
        )
        return f"<LazyModule {nombre} ({estado})>"
