"""Tests para lazy_imports — el proxy que retrasa yt-dlp/httpx."""

import sys

from lazy_imports import LazyModule


def test_no_importa_hasta_el_primer_acceso():
    nombre = "modulo_que_no_existe_para_openwave"
    proxy = LazyModule(nombre)

    assert "sin cargar" in repr(proxy)
    assert nombre not in sys.modules


def test_carga_y_delega_el_acceso():
    proxy = LazyModule("json")

    assert proxy.dumps({"a": 1}) == '{"a": 1}'
    assert "cargado" in repr(proxy)


def test_setattr_va_al_modulo_real(monkeypatch):
    proxy = LazyModule("json")
    monkeypatch.setattr(proxy, "dumps", lambda _obj: "parcheado")

    assert proxy.dumps({}) == "parcheado"


def test_dir_devuelve_los_atributos_del_modulo():
    proxy = LazyModule("json")

    assert "loads" in dir(proxy)
