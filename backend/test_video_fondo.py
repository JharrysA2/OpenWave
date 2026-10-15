"""Tests para backend/video_fondo.py — Preparación del vídeo de fondo de la pantalla de letras."""

import os
import re

import pytest
import yt_dlp
from cache import video_progress
from config import VIDEO_DIR
from db import db_set_videoclip_oficial
from video_fondo import (
    _MP4,
    _MP4_ANDROID,
    _WEBM_ANDROID,
    _evict_if_needed,
    delete_video,
    get_output_path,
    get_video_path,
    is_prepared,
    prepare_video,
    sin_videoclip,
    video_cache_size,
)


@pytest.fixture(autouse=True)
def _resolucion_oficial_neutra(monkeypatch):
    """Por defecto, sin videoclip oficial: se descarga el vídeo de la canción.

    Evita que los tests de la descarga salgan a la red por la búsqueda del
    videoclip; los tests que van de eso la sobreescriben con su monkeypatch.
    """
    monkeypatch.setattr("video_fondo.resolver_videoclip", lambda video_id: video_id)


class TestPaths:
    """Rutas deterministas del fichero muxado."""

    def test_get_video_path_nombre_determinista(self):
        assert get_video_path("abcdefghijk") == VIDEO_DIR / "abcdefghijk.mp4"

    def test_get_output_path_none_si_no_existe(self):
        assert get_output_path("abcdefghijk") is None

    def test_is_prepared_falso_sin_fichero(self):
        assert is_prepared("abcdefghijk") is False

    def test_get_output_path_mp4(self):
        p = VIDEO_DIR / "zzzzzzzzzz.mp4"
        p.write_bytes(b"x")
        try:
            assert get_output_path("zzzzzzzzzz") == p
        finally:
            p.unlink(missing_ok=True)

    def test_get_output_path_webm(self):
        p = VIDEO_DIR / "yyyyyyyyyyy.webm"
        p.write_bytes(b"x")
        try:
            assert get_output_path("yyyyyyyyyyy") == p
        finally:
            p.unlink(missing_ok=True)


class _FakeYdl:
    """YoutubeDL de mentira: «descarga» y publica el fichero final en VIDEO_DIR."""

    instances = []

    def __init__(self, opts):
        self.opts = opts
        self.video_id = None
        _FakeYdl.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def download(self, urls):
        m = re.search(r"v=([\w-]+)$", urls[0])
        assert m, f"URL no esperada: {urls[0]}"
        self.video_id = m.group(1)
        out = VIDEO_DIR / f"{self.video_id}.mp4"
        out.write_bytes(b"fake-video")
        # Disparar los hooks como una descarga real (progreso + fin).
        for hook in self.opts.get("progress_hooks", []):
            hook({"status": "downloading", "_percent_str": "50%"})
            hook({"status": "finished"})


class TestPrepareVideo:
    """prepare_video con yt-dlp mockeado."""

    def test_descarga_muxa_y_marca_done(self, monkeypatch):
        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _FakeYdl)
        monkeypatch.setattr("video_fondo._evict_if_needed", lambda: 0)
        try:
            prepare_video("abc123")
            assert video_progress["abc123"]["status"] == "done"
            assert (VIDEO_DIR / "abc123.mp4").exists()
            # Un solo intento bastó (el primero publica el mp4).
            assert len(_FakeYdl.instances) == 1
        finally:
            delete_video("abc123")
            video_progress.pop("abc123", None)
            _FakeYdl.instances.clear()

    def test_idempotente_si_ya_preparado(self, monkeypatch):
        p = VIDEO_DIR / "prep_id.mp4"
        p.write_bytes(b"x")

        class _Boom:
            def __init__(self, opts):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def download(self, urls):
                raise AssertionError("no debería descargarse: ya está preparado")

        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _Boom)
        try:
            prepare_video("prep_id")
            assert video_progress["prep_id"]["status"] == "done"
            assert p.exists()
        finally:
            p.unlink(missing_ok=True)
            video_progress.pop("prep_id", None)

    def test_error_queda_registrado(self, monkeypatch):
        class _Fail:
            def __init__(self, opts):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def download(self, urls):
                raise yt_dlp.utils.DownloadError("formato limitado sin PO token")

        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _Fail)
        try:
            prepare_video("fail_id")
            state = video_progress["fail_id"]
            assert state["status"] == "error"
            assert state["error"]
        finally:
            video_progress.pop("fail_id", None)

    def test_sin_ffmpeg_usa_path_por_defecto(self, monkeypatch):
        """Sin ffmpeg empaquetado, no se fuerza ffmpeg_location."""
        monkeypatch.setattr("video_fondo._search_ffmpeg_dir", lambda: None)
        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _FakeYdl)
        monkeypatch.setattr("video_fondo._evict_if_needed", lambda: 0)
        try:
            prepare_video("ff_id")
            opts = _FakeYdl.instances[0].opts
            assert "ffmpeg_location" not in opts
        finally:
            delete_video("ff_id")
            video_progress.pop("ff_id", None)
            _FakeYdl.instances.clear()

    def test_cookies_txt_es_el_primer_intento(self, monkeypatch):
        """Con `cookies.txt`, el primer intento lo usa (mejor calidad)."""
        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _FakeYdl)
        monkeypatch.setattr(
            "video_fondo.cookies_file_opt", lambda: {"cookiefile": "/tmp/ck.txt"}
        )
        monkeypatch.setattr("video_fondo._evict_if_needed", lambda: 0)
        try:
            prepare_video("ckfile")
            assert _FakeYdl.instances[0].opts["cookiefile"] == "/tmp/ck.txt"
        finally:
            delete_video("ckfile")
            video_progress.pop("ckfile", None)
            _FakeYdl.instances.clear()

    def test_sin_cookies_txt_prueba_navegadores_al_final(self, monkeypatch):
        """Sin `cookies.txt`, las cookies del navegador son el último recurso."""
        from yt_dlp.utils import DownloadError

        class _CookieYdl(_FakeYdl):
            def download(self, urls):
                if "cookiesfrombrowser" not in self.opts:
                    raise DownloadError("403 sin cookies")
                super().download(urls)

        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _CookieYdl)
        monkeypatch.setattr("video_fondo.cookies_file_opt", lambda: None)
        monkeypatch.setattr("video_fondo._evict_if_needed", lambda: 0)
        try:
            prepare_video("cknav")
            assert video_progress["cknav"]["status"] == "done"
            # 3 intentos anónimos + 1.º con cookies (chrome).
            assert len(_FakeYdl.instances) == 4
            assert _FakeYdl.instances[-1].opts["cookiesfrombrowser"] == ("chrome",)
        finally:
            delete_video("cknav")
            video_progress.pop("cknav", None)
            _FakeYdl.instances.clear()


class TestCacheLimit:
    """Evicción LRU de la caché de vídeo."""

    def test_video_cache_size_suma_finales(self):
        a = VIDEO_DIR / "size_a.mp4"
        b = VIDEO_DIR / "size_b.webm"
        a.write_bytes(b"a" * 100)
        b.write_bytes(b"b" * 50)
        try:
            assert video_cache_size() == 150
        finally:
            a.unlink(missing_ok=True)
            b.unlink(missing_ok=True)

    def test_eviccion_libera_hasta_el_tope(self, monkeypatch):
        old = VIDEO_DIR / "old_vid.mp4"
        new = VIDEO_DIR / "new_vid.mp4"
        old.write_bytes(b"o" * 100)
        new.write_bytes(b"n" * 200)
        # El antiguo queda por debajo del nuevo en mtime (orden LRU).
        os.utime(old, (1_000_000, 1_000_000))
        os.utime(new, (2_000_000, 2_000_000))
        monkeypatch.setattr("video_fondo.VIDEO_CACHE_MAX_BYTES", 250)
        try:
            removed = _evict_if_needed()
            assert removed == 1
            assert not old.exists(), "el menos reciente debe podarse"
            assert new.exists(), "el más reciente se conserva"
        finally:
            old.unlink(missing_ok=True)
            new.unlink(missing_ok=True)

    def test_eviccion_sin_exceso_no_borra(self, monkeypatch):
        p = VIDEO_DIR / "keep_vid.mp4"
        p.write_bytes(b"k" * 300)
        monkeypatch.setattr("video_fondo.VIDEO_CACHE_MAX_BYTES", 10 * 1024)
        try:
            assert _evict_if_needed() == 0
            assert p.exists()
        finally:
            p.unlink(missing_ok=True)


class TestDeleteVideo:
    """Borrado del vídeo preparado y de los restos de su descarga."""

    def test_borra_final_e_intermedios(self):
        final = VIDEO_DIR / "del_vid.mp4"
        inter = VIDEO_DIR / "del_vid.f137.mp4"
        final.write_bytes(b"f")
        inter.write_bytes(b"i")
        try:
            assert delete_video("del_vid") is True
            assert not final.exists()
            assert not inter.exists()
        finally:
            final.unlink(missing_ok=True)
            inter.unlink(missing_ok=True)

    def test_sin_ficheros_devuelve_false(self):
        assert delete_video("nada_por_aqui") is False
        # No debe quedar basura del intento.
        assert list(VIDEO_DIR.glob("nada_por_aqui.*")) == []


class TestVideoclipOficial:
    """prepare_video con la búsqueda del videoclip oficial."""

    def test_descarga_el_videoclip_y_no_el_video_de_la_cancion(self, monkeypatch):
        urls: list[str] = []

        class _Ydl:
            def __init__(self, opts):
                self.opts = opts

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def download(self, links):
                urls.extend(links)
                # yt-dlp publica el fichero final con el nombre de la CANCIÓN.
                (VIDEO_DIR / "of_song.mp4").write_bytes(b"videoclip")

        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _Ydl)
        monkeypatch.setattr("video_fondo._evict_if_needed", lambda: 0)
        monkeypatch.setattr(
            "video_fondo.resolver_videoclip", lambda video_id: "clipe_ok"
        )
        try:
            prepare_video("of_song")
            assert urls == ["https://www.youtube.com/watch?v=clipe_ok"]
            assert video_progress["of_song"]["status"] == "done"
            assert (VIDEO_DIR / "of_song.mp4").exists()
        finally:
            delete_video("of_song")
            video_progress.pop("of_song", None)

    def test_sin_videoclip_no_descarga_nada(self, monkeypatch):
        descargas: list[list[str]] = []

        class _Ydl:
            def __init__(self, opts):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def download(self, links):
                descargas.append(links)

        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _Ydl)
        monkeypatch.setattr("video_fondo.resolver_videoclip", lambda video_id: None)
        try:
            prepare_video("sv_song")
            assert descargas == []
            assert video_progress["sv_song"]["status"] == "sin_video"
            assert get_output_path("sv_song") is None
        finally:
            video_progress.pop("sv_song", None)

    def test_sin_oficial_no_busca_videoclip(self, monkeypatch):
        """``usar_oficial=False``: comportamiento anterior, sin tocar la red."""
        urls: list[str] = []

        class _Ydl:
            def __init__(self, opts):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def download(self, links):
                urls.extend(links)
                (VIDEO_DIR / "sin_of.mp4").write_bytes(b"v")

        def _explota(video_id):
            raise AssertionError("no debería buscar el videoclip oficial")

        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _Ydl)
        monkeypatch.setattr("video_fondo._evict_if_needed", lambda: 0)
        monkeypatch.setattr("video_fondo.resolver_videoclip", _explota)
        try:
            prepare_video("sin_of", usar_oficial=False)
            assert urls == ["https://www.youtube.com/watch?v=sin_of"]
            assert video_progress["sin_of"]["status"] == "done"
        finally:
            delete_video("sin_of")
            video_progress.pop("sin_of", None)


class TestTopeCalidad:
    """Las escaleras de formato no pasan de 1080p (y degradan, no fallan)."""

    def test_escaleras_capan_a_1080(self):
        assert "height<=1080" in _MP4["format"]
        assert "height<=1080" in _MP4_ANDROID["format"]
        assert "height<=1080" in _WEBM_ANDROID["format"]

    def test_hay_fallback_sin_filtro(self):
        assert _MP4["format"].endswith("/bv*+ba/b")


class TestSinVideoclip:
    """sin_videoclip() lee la resolución cacheada."""

    def test_sin_resolucion_no_afirma_nada(self):
        assert sin_videoclip("cancion_nueva") is False

    def test_no_resultado_cacheado(self):
        db_set_videoclip_oficial("sin_clip", None)
        assert sin_videoclip("sin_clip") is True

    def test_resolucion_con_videoclip(self):
        db_set_videoclip_oficial("con_clip", "otro_id")
        assert sin_videoclip("con_clip") is False
