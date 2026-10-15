"""Tests para backend/ytdlp_auth.py — Fuentes de cookies para yt-dlp."""

from unittest.mock import patch

import ytdlp_auth
from ytdlp_auth import (
    COOKIE_BROWSERS,
    auth_variants,
    browser_cookie_opts,
    cookies_file_opt,
)


class TestCookiesFileOpt:
    """`cookies.txt` del usuario: la vía más fiable."""

    def test_sin_fichero_no_devuelve_opcion(self, tmp_path):
        with patch.object(ytdlp_auth, "COOKIES_FILE", tmp_path / "cookies.txt"):
            assert cookies_file_opt() is None

    def test_con_fichero_devuelve_cookiefile(self, tmp_path):
        cookies = tmp_path / "cookies.txt"
        cookies.write_text("# Netscape HTTP Cookie File\n", encoding="utf-8")
        with patch.object(ytdlp_auth, "COOKIES_FILE", cookies):
            assert cookies_file_opt() == {"cookiefile": str(cookies)}

    def test_fichero_es_directorio_no_cuenta(self, tmp_path):
        # is_file() es False para un directorio: no debe explotar.
        with patch.object(ytdlp_auth, "COOKIES_FILE", tmp_path):
            assert cookies_file_opt() is None


class TestBrowserCookieOpts:
    """Cookies del navegador: respaldo, una opción por navegador."""

    def test_una_opcion_por_navegador_en_orden(self):
        assert browser_cookie_opts() == [
            {"cookiesfrombrowser": (browser,)} for browser in COOKIE_BROWSERS
        ]


class TestAuthVariants:
    """Orden global: cookies.txt primero, navegadores después."""

    def test_sin_cookies_txt_solo_navegadores(self, tmp_path):
        with patch.object(ytdlp_auth, "COOKIES_FILE", tmp_path / "nope.txt"):
            assert auth_variants() == browser_cookie_opts()

    def test_con_cookies_txt_va_primero(self, tmp_path):
        cookies = tmp_path / "cookies.txt"
        cookies.write_text("x", encoding="utf-8")
        with patch.object(ytdlp_auth, "COOKIES_FILE", cookies):
            variants = auth_variants()
            assert variants[0] == {"cookiefile": str(cookies)}
            assert variants[1:] == browser_cookie_opts()
