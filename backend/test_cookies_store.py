"""Tests para backend/cookies_store.py — Validación y guardado de cookies."""

import os
import time
from pathlib import Path

import cookies_store
import pytest
import yt_dlp

COOKIES_OK = (
    "# Netscape HTTP Cookie File\n"
    ".youtube.com\tTRUE\t/\tTRUE\t4102444800\tSID\tabc123\n"
    ".youtube.com\tTRUE\t/\tTRUE\t4102444800\tHSID\tdef456\n"
)


@pytest.fixture
def cookies_tmp(tmp_path, monkeypatch):
    """Aislar cookies.txt y su estado en un directorio temporal."""
    destino = tmp_path / "cookies.txt"
    monkeypatch.setattr(cookies_store, "COOKIES_FILE", destino)
    return destino


class TestAnalizarCookies:
    def test_fichero_netscape_valido(self):
        datos = cookies_store.analizar_cookies(COOKIES_OK)
        assert datos["ok"] is True
        assert datos["cookies"] == 2
        assert datos["auth"] == 2

    def test_acepta_bom_de_windows(self):
        datos = cookies_store.analizar_cookies("\ufeff" + COOKIES_OK)
        assert datos["ok"] is True

    def test_acepta_prefijo_httponly(self):
        texto = (
            "# Netscape HTTP Cookie File\n"
            "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t4102444800\tSID\tabc\n"
        )
        datos = cookies_store.analizar_cookies(texto)
        assert datos["ok"] is True

    def test_acepta_cookies_de_sesion_sin_caducidad(self):
        texto = ".youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc\n"
        assert cookies_store.analizar_cookies(texto)["ok"] is True

    def test_rechaza_vacio(self):
        assert cookies_store.analizar_cookies("")["ok"] is False
        assert cookies_store.analizar_cookies("   \n")["ok"] is False

    def test_rechaza_solo_comentarios(self):
        datos = cookies_store.analizar_cookies("# Netscape HTTP Cookie File\n")
        assert datos["ok"] is False
        assert "ninguna cookie" in datos["error"]

    def test_rechaza_sin_youtube(self):
        texto = ".example.com\tTRUE\t/\tTRUE\t4102444800\tSID\tabc\n"
        datos = cookies_store.analizar_cookies(texto)
        assert datos["ok"] is False
        assert "youtube.com" in datos["error"]

    def test_rechaza_sin_cookies_de_sesion(self):
        texto = ".youtube.com\tTRUE\t/\tTRUE\t4102444800\tPREF\tabc\n"
        datos = cookies_store.analizar_cookies(texto)
        assert datos["ok"] is False
        assert "sesión" in datos["error"]

    def test_rechaza_cookies_caducadas(self):
        texto = ".youtube.com\tTRUE\t/\tTRUE\t1\tSID\tabc\n"
        datos = cookies_store.analizar_cookies(texto)
        assert datos["ok"] is False
        assert "caducadas" in datos["error"]

    def test_rechaza_linea_sin_siete_campos(self):
        texto = ".youtube.com\tTRUE\t/\tSID\tabc\n"
        datos = cookies_store.analizar_cookies(texto)
        assert datos["ok"] is False
        assert "7 campos" in datos["error"]

    def test_rechaza_caducidad_no_numerica(self):
        texto = ".youtube.com\tTRUE\t/\tTRUE\tmañana\tSID\tabc\n"
        datos = cookies_store.analizar_cookies(texto)
        assert datos["ok"] is False
        assert "caducidad" in datos["error"]

    def test_rechaza_fichero_demasiado_grande(self):
        datos = cookies_store.analizar_cookies("x" * (cookies_store.MAX_BYTES + 1))
        assert datos["ok"] is False
        assert "máximo" in datos["error"]


class _YdlOk:
    def __init__(self, opciones):
        self.opciones = opciones

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def extract_info(self, url, download=False):
        assert url == cookies_store.URL_COMPROBACION
        assert download is False
        return {"_type": "playlist", "entries": []}


class _YdlError:
    def __init__(self, mensaje):
        self.mensaje = mensaje

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def extract_info(self, url, download=False):
        raise yt_dlp.utils.DownloadError(self.mensaje)


class TestProbarSesion:
    def test_watch_later_disponible(self, tmp_path, monkeypatch):
        monkeypatch.setattr(cookies_store.yt_dlp, "YoutubeDL", _YdlOk)
        ruta = tmp_path / "cookies.txt"
        ruta.write_text(COOKIES_OK, encoding="utf-8")
        assert cookies_store._probar_sesion(ruta)["ok"] is True

    def test_playlist_inexistente_significa_sin_sesion(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            cookies_store.yt_dlp,
            "YoutubeDL",
            lambda _opts: _YdlError(
                "ERROR: [youtube:tab] WL: YouTube said: The playlist does not exist."
            ),
        )
        resultado = cookies_store._probar_sesion(tmp_path / "cookies.txt")
        assert resultado["ok"] is False
        assert "sesión válida" in resultado["error"]

    def test_fallo_de_red_se_explica(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            cookies_store.yt_dlp,
            "YoutubeDL",
            lambda _opts: _YdlError("Unable to download webpage: timed out"),
        )
        resultado = cookies_store._probar_sesion(tmp_path / "cookies.txt")
        assert resultado["ok"] is False
        assert "conectar" in resultado["error"]

    def test_error_inesperado_no_filtra_trazas(self, tmp_path, monkeypatch):
        class _Boom:
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def extract_info(self, *args, **kwargs):
                raise RuntimeError("boom interno")

        monkeypatch.setattr(cookies_store.yt_dlp, "YoutubeDL", lambda _o: _Boom())
        resultado = cookies_store._probar_sesion(tmp_path / "cookies.txt")
        assert resultado["ok"] is False
        assert "boom interno" in resultado["error"]

    def test_verificar_borra_el_temporal(self, tmp_path, cookies_tmp, monkeypatch):
        monkeypatch.setattr(cookies_store.yt_dlp, "YoutubeDL", _YdlOk)
        resultado = cookies_store.verificar_cookies(COOKIES_OK)
        assert resultado["ok"] is True
        assert list(tmp_path.glob(".cookies-verificacion-*")) == []
        assert not cookies_tmp.exists()


class TestGuardarCookies:
    def test_guarda_solo_si_la_sesion_funciona(self, cookies_tmp, monkeypatch):
        monkeypatch.setattr(
            cookies_store, "_probar_sesion", lambda _r: {"ok": True, "metodo": "WL"}
        )
        resultado = cookies_store.guardar_cookies(COOKIES_OK)
        assert resultado["ok"] is True
        assert cookies_tmp.read_text(encoding="utf-8") == COOKIES_OK
        if os.name == "posix":
            assert cookies_tmp.stat().st_mode & 0o777 == 0o600
        estado = cookies_store.estado_cookies()
        assert estado["configurado"] is True
        assert estado["verificacion"]["ok"] is True

    def test_no_pisa_las_anteriores_si_falla_la_verificacion(
        self, cookies_tmp, monkeypatch
    ):
        cookies_tmp.write_text(COOKIES_OK, encoding="utf-8")
        monkeypatch.setattr(
            cookies_store,
            "_probar_sesion",
            lambda _r: {"ok": False, "error": "sesión caducada"},
        )
        resultado = cookies_store.guardar_cookies(
            ".youtube.com\tTRUE\t/\tTRUE\t4102444800\tSID\tnueva\n"
        )
        assert resultado["ok"] is False
        assert cookies_tmp.read_text(encoding="utf-8") == COOKIES_OK
        # El último intento fallido queda anotado para que la UI lo muestre.
        estado = cookies_store.estado_cookies()
        assert estado["verificacion"]["ok"] is False

    def test_no_guarda_un_formato_invalido(self, cookies_tmp):
        resultado = cookies_store.guardar_cookies("no es un cookies.txt")
        assert resultado["ok"] is False
        assert not cookies_tmp.exists()

    def test_comprobar_guardadas(self, cookies_tmp, monkeypatch):
        cookies_tmp.write_text(COOKIES_OK, encoding="utf-8")
        monkeypatch.setattr(
            cookies_store, "_probar_sesion", lambda _r: {"ok": True, "metodo": "WL"}
        )
        resultado = cookies_store.comprobar_guardadas()
        assert resultado["ok"] is True
        assert cookies_store.estado_cookies()["verificacion"]["ok"] is True

    def test_comprobar_sin_fichero(self, cookies_tmp):
        resultado = cookies_store.comprobar_guardadas()
        assert resultado["ok"] is False
        assert "No hay cookies" in resultado["error"]

    def test_borrar(self, cookies_tmp, monkeypatch):
        cookies_tmp.write_text(COOKIES_OK, encoding="utf-8")
        cookies_store._guardar_estado({"ok": True})
        assert cookies_store.borrar_cookies()["ok"] is True
        assert not cookies_tmp.exists()
        assert cookies_store.estado_cookies() == {"configurado": False}
        assert not (cookies_tmp.parent / "cookies.estado.json").exists()


def test_estado_inicial(cookies_tmp):
    assert cookies_store.estado_cookies() == {"configurado": False}


def test_el_estado_no_expone_el_contenido(cookies_tmp, monkeypatch):
    monkeypatch.setattr(cookies_store, "_probar_sesion", lambda _r: {"ok": True})
    cookies_store.guardar_cookies(COOKIES_OK)
    estado = cookies_store.estado_cookies()
    serializado = str(estado)
    assert "SID" not in serializado
    assert "abc123" not in serializado


def test_mtime_de_cookies_para_la_cache_de_video(cookies_tmp, monkeypatch):
    """El guardado real actualiza la fecha: el motor de vídeo la usa para
    decidir si un vídeo viejo se vuelve a descargar con mejor sesión."""
    monkeypatch.setattr(cookies_store, "_probar_sesion", lambda _r: {"ok": True})
    antes = time.time() - 10
    cookies_store.guardar_cookies(COOKIES_OK)
    assert cookies_tmp.stat().st_mtime >= antes


def test_ruta_de_estado_junto_al_fichero(tmp_path, monkeypatch):
    monkeypatch.setattr(cookies_store, "COOKIES_FILE", tmp_path / "cookies.txt")
    assert cookies_store._fichero_estado() == tmp_path / "cookies.estado.json"
    assert isinstance(Path(cookies_store._fichero_estado()), Path)
