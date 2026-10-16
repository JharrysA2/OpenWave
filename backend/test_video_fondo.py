"""Tests para backend/video_fondo.py — Preparación del vídeo de fondo de la pantalla de letras."""

import os
import re

import pytest
import yt_dlp
from cache import video_progress
from config import VIDEO_DIR
from db import db_get_videoclip_oficial, db_set_videoclip_oficial
from video_fondo import (
    _MP4,
    _MP4_ANDROID,
    _MP4_EMBEDDED,
    _WEBM_ANDROID,
    _cap_alto,
    _escaleras,
    _evict_if_needed,
    calidad_guardada,
    calidad_suficiente,
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


def _ffprobe_falso(alto: int | None):
    """Devuelve un `_ffmpeg_bin` falso cuya salida anuncia ``alto`` píxeles.

    ``None`` simula «no se puede medir» (sin ffmpeg o fichero ilegible): la
    app debe caer al criterio viejo de 1080p en vez de reventar.
    """

    def _bin():
        return "ffmpeg-falso"

    def _run(cmd, **kwargs):
        class _P:
            stderr = (
                f"Stream #0:0: Video: vp9, yuv420p, 1920x{alto}, 30 fps\n"
                if alto
                else "moov atom not found\n"
            )

        return _P()

    return _bin, _run


def _aplicar_ffprobe(monkeypatch, alto: int | None):
    """Fija en video_fondo un ffmpeg que «mide» ``alto`` píxeles."""
    _bin, _run = _ffprobe_falso(alto)
    monkeypatch.setattr("video_fondo._ffmpeg_bin", _bin)
    monkeypatch.setattr("video_fondo.subprocess.run", _run)


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
            # 4 intentos anónimos + el 1.º con cookies (chrome).
            assert len(_FakeYdl.instances) == 5
            assert _FakeYdl.instances[-1].opts["cookiesfrombrowser"] == ("chrome",)
        finally:
            delete_video("cknav")
            video_progress.pop("cknav", None)
            _FakeYdl.instances.clear()


class TestCalidad:
    """El vídeo de fondo se pide con lo necesario para llegar a 1080p."""

    def test_primer_intento_anonimo_es_el_cliente_embed(self, monkeypatch):
        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _FakeYdl)
        monkeypatch.setattr("video_fondo._evict_if_needed", lambda: 0)
        try:
            prepare_video("emb_id")
            opts = _FakeYdl.instances[0].opts
            assert opts["extractor_args"]["youtube"]["player_client"] == [
                "web_embedded"
            ]
        finally:
            delete_video("emb_id")
            video_progress.pop("emb_id", None)
            _FakeYdl.instances.clear()

    def test_habilita_todos_los_runtimes_de_js(self, monkeypatch):
        """Sin un runtime de JS, yt-dlp no puede descifrar los formatos altos."""
        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _FakeYdl)
        monkeypatch.setattr("video_fondo._evict_if_needed", lambda: 0)
        try:
            prepare_video("js_id")
            assert set(_FakeYdl.instances[0].opts["js_runtimes"]) == {
                "deno",
                "node",
                "bun",
                "quickjs",
            }
        finally:
            delete_video("js_id")
            video_progress.pop("js_id", None)
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
    """El tope de resolución: 1080p por defecto y hasta 4K si la pantalla lo pide."""

    def test_escaleras_capan_a_1080(self):
        assert "height<=1080" in _MP4["format"]
        assert "height<=1080" in _MP4_EMBEDDED["format"]
        assert "height<=1080" in _MP4_ANDROID["format"]
        assert "height<=1080" in _WEBM_ANDROID["format"]

    def test_hay_fallback_sin_filtro(self):
        assert _MP4["format"].endswith("/bv*+ba/b")

    def test_cap_alto_sanea_el_valor_de_la_pantalla(self):
        """El valor llega del navegador: se acota al rango que admite YouTube."""
        assert _cap_alto(None) == 1080
        assert _cap_alto("no-numero") == 1080
        assert _cap_alto(0) == 720
        assert _cap_alto(720) == 720
        assert _cap_alto(2160) == 2160
        assert _cap_alto(4320) == 2160

    def test_escaleras_4k_capan_a_la_pantalla(self):
        """Con pantalla 4K el filtro sube, pero sigue degradando sin fallar."""
        embedded, mp4, mp4_android, webm_android = _escaleras(2160)
        for escalera in (embedded, mp4, mp4_android, webm_android):
            assert "height<=2160" in escalera["format"]
        assert mp4["format"].endswith("/bv*+ba/b")

    def test_calidad_suficiente_sin_fichero(self):
        assert calidad_suficiente("cal_nada", 2160) is False

    def test_calidad_suficiente_mide_la_real_en_descargas_antiguas(self, monkeypatch):
        """Los vídeos de antes no anotaron su resolución: se mide la real."""
        p = VIDEO_DIR / "cal_viejo.mp4"
        p.write_bytes(b"x")
        try:
            # Sin sidecar, la app mide el fichero: aquí sale 720p.
            _aplicar_ffprobe(monkeypatch, 720)
            # Un 720p NO satisface el tope por defecto (1080p): se redescarga.
            assert calidad_suficiente("cal_viejo") is False
            assert calidad_suficiente("cal_viejo", 720) is True
            # Una pantalla que pide más de lo medido fuerza la redescarga.
            assert calidad_suficiente("cal_viejo", 1080) is False
            assert calidad_suficiente("cal_viejo", 2160) is False
            # Y la medida queda anotada para no volver a sondear.
            assert calidad_guardada("cal_viejo") == 720
        finally:
            p.unlink(missing_ok=True)
            (VIDEO_DIR / "cal_viejo.calidad").unlink(missing_ok=True)

    def test_calidad_suficiente_sin_ffmpeg_cae_a_1080(self, monkeypatch):
        """Sin ffmpeg (o fichero ilegible) se sigue usando el criterio viejo."""
        p = VIDEO_DIR / "cal_nof.mp4"
        p.write_bytes(b"x")
        try:
            _aplicar_ffprobe(monkeypatch, None)
            assert calidad_suficiente("cal_nof") is True
            assert calidad_suficiente("cal_nof", 2160) is False
        finally:
            p.unlink(missing_ok=True)
            (VIDEO_DIR / "cal_nof.calidad").unlink(missing_ok=True)

    def test_calidad_suficiente_no_sondea_si_ya_hay_sidecar(self, monkeypatch):
        """El sidecar es caché: si ya existe, no se vuelve a llamar a ffmpeg.

        Es el contrato que evita pagar una medición en cada apertura de la
        pantalla de letras. Un clip ya anotado no se corrige midiendo otra vez.
        """

        def _boom(*args, **kwargs):
            raise AssertionError("no debe medirse: ya hay sidecar")

        monkeypatch.setattr("video_fondo.subprocess.run", _boom)
        p = VIDEO_DIR / "cal_cache.mp4"
        p.write_bytes(b"x")
        (VIDEO_DIR / "cal_cache.calidad").write_text("2160", encoding="utf-8")
        try:
            assert calidad_suficiente("cal_cache", 2160) is True
        finally:
            p.unlink(missing_ok=True)
            (VIDEO_DIR / "cal_cache.calidad").unlink(missing_ok=True)

    def test_calidad_suficiente_respeta_la_real_anotada(self, monkeypatch):
        """Con la resolución real anotada no se vuelve a descargar."""
        p = VIDEO_DIR / "cal_4k.mp4"
        p.write_bytes(b"x")
        (VIDEO_DIR / "cal_4k.calidad").write_text("2160", encoding="utf-8")
        try:
            _aplicar_ffprobe(monkeypatch, 2160)
            assert calidad_guardada("cal_4k") == 2160
            assert calidad_suficiente("cal_4k", 2160) is True
        finally:
            p.unlink(missing_ok=True)
            (VIDEO_DIR / "cal_4k.calidad").unlink(missing_ok=True)

    def test_prepare_redescarga_cuando_pide_mas_la_pantalla(self, monkeypatch):
        """Un 1080p en pantalla 4K se vuelve a bajar y anota la nueva medida."""
        p = VIDEO_DIR / "up_vid.mp4"
        p.write_bytes(b"viejo")
        # Descargado antes para una pantalla 1080p: el sidecar lo atestigua.
        (VIDEO_DIR / "up_vid.calidad").write_text("1080", encoding="utf-8")
        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _FakeYdl)
        monkeypatch.setattr("video_fondo._evict_if_needed", lambda: 0)
        try:
            # YouTube acaba sirviendo 2160p y eso es lo que debe quedar anotado.
            _aplicar_ffprobe(monkeypatch, 2160)
            prepare_video("up_vid", max_alto=2160)
            assert video_progress["up_vid"]["status"] == "done"
            # Se pidió con el filtro 4K y la resolución REAL quedó anotada.
            assert "height<=2160" in _FakeYdl.instances[0].opts["format"]
            assert calidad_guardada("up_vid") == 2160
            assert calidad_suficiente("up_vid", 2160) is True
        finally:
            delete_video("up_vid")
            (VIDEO_DIR / "up_vid.calidad").unlink(missing_ok=True)
            video_progress.pop("up_vid", None)
            _FakeYdl.instances.clear()

    def test_prepare_anota_lo_que_youtube_sirvio_de_verdad(self, monkeypatch):
        """Si YouTube recorta la descarga, se anota lo recortado, no lo pedido.

        Es el bug que congelaba un clip a 720p: se pedía 1080p, YouTube daba
        720p y el sidecar anotaba 1080p, con lo que nunca se volvía a bajar.
        """
        p = VIDEO_DIR / "up_recorte.mp4"
        p.write_bytes(b"viejo")
        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _FakeYdl)
        monkeypatch.setattr("video_fondo._evict_if_needed", lambda: 0)
        try:
            # Se pidió 1080p pero el fichero acaba siendo 720p.
            _aplicar_ffprobe(monkeypatch, 720)
            prepare_video("up_recorte", max_alto=1080)
            assert calidad_guardada("up_recorte") == 720
            # Y al volver a abrirla, al no llegar a 1080p se corrige sola.
            assert calidad_suficiente("up_recorte", 1080) is False
        finally:
            delete_video("up_recorte")
            video_progress.pop("up_recorte", None)
            _FakeYdl.instances.clear()

    def test_prepare_no_redescarga_si_la_resolucion_ya_alcanza(self, monkeypatch):
        """Con la resolución suficiente ya anotada, la siguiente apertura no
        vuelve a descargar."""
        p = VIDEO_DIR / "up_fijo.mp4"
        p.write_bytes(b"4k")
        (VIDEO_DIR / "up_fijo.calidad").write_text("2160", encoding="utf-8")

        class _Boom:
            def __init__(self, opts):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def download(self, urls):
                raise AssertionError("no debe redescargarse: el tope ya se pidió")

        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _Boom)
        try:
            prepare_video("up_fijo", max_alto=2160)
            assert video_progress["up_fijo"]["status"] == "done"
            assert p.read_bytes() == b"4k"
        finally:
            p.unlink(missing_ok=True)
            (VIDEO_DIR / "up_fijo.calidad").unlink(missing_ok=True)
            video_progress.pop("up_fijo", None)


class TestDesfase:
    """La medición del desfase con la canción dentro de prepare_video."""

    def test_done_lleva_el_desfase(self, monkeypatch):
        """Sin videoclip oficial no hay nada que medir: va a la par (0.0)."""
        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _FakeYdl)
        monkeypatch.setattr("video_fondo._evict_if_needed", lambda: 0)
        try:
            prepare_video("desf_ok")
            assert video_progress["desf_ok"]["status"] == "done"
            assert video_progress["desf_ok"]["desfase"] == 0.0
        finally:
            delete_video("desf_ok")
            video_progress.pop("desf_ok", None)
            _FakeYdl.instances.clear()

    def test_ya_preparado_calcula_el_desfase_si_falta(self, monkeypatch):
        """Un fichero de un intento anterior no deja la medición a medias."""
        p = VIDEO_DIR / "desf_pend.mp4"
        p.write_bytes(b"x")
        llamadas: list[tuple] = []

        def _desfase_conocido(video_id, fuente_id, usar_oficial):
            llamadas.append((video_id, fuente_id, usar_oficial))
            return 12.5

        monkeypatch.setattr("video_fondo._resolver_desfase", _desfase_conocido)

        def _no_descarga(*args, **kwargs):
            raise AssertionError("el fichero ya está: no debe re-descargarse")

        monkeypatch.setattr("video_fondo._descargar", _no_descarga)
        try:
            prepare_video("desf_pend")
            assert llamadas == [("desf_pend", "desf_pend", True)]
            assert video_progress["desf_pend"] == {
                "status": "done",
                "progress": 100,
                "error": None,
                "desfase": 12.5,
            }
        finally:
            p.unlink(missing_ok=True)
            video_progress.pop("desf_pend", None)

    def test_fallo_de_medicion_no_cachea_sin_videoclip(self, monkeypatch):
        """Fallo transitorio (ffmpeg/red): se marca «error», NO «no tiene».

        Además el fichero se conserva, así que el reintento no vuelve a
        descargar el vídeo entero.
        """

        def _explota(video_id, fuente_id, usar_oficial):
            raise RuntimeError("ffmpeg reventado")

        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _FakeYdl)
        monkeypatch.setattr("video_fondo._evict_if_needed", lambda: 0)
        monkeypatch.setattr("video_fondo._resolver_desfase", _explota)
        try:
            prepare_video("desf_err")
            assert video_progress["desf_err"]["status"] == "error"
            assert get_output_path("desf_err") is not None, "el vídeo se conserva"
            assert not sin_videoclip("desf_err"), "no se cachea como «sin clip»"
        finally:
            delete_video("desf_err")
            video_progress.pop("desf_err", None)
            _FakeYdl.instances.clear()

    def test_desfase_no_medible_descarta_y_cachea(self, monkeypatch):
        """La comparación se completó y el vídeo no cuadra: se descarta y no
        se vuelve a descargar en cada apertura."""
        monkeypatch.setattr("video_fondo.yt_dlp.YoutubeDL", _FakeYdl)
        monkeypatch.setattr("video_fondo._evict_if_needed", lambda: 0)
        monkeypatch.setattr(
            "video_fondo._resolver_desfase", lambda *args, **kwargs: None
        )
        try:
            prepare_video("desf_none")
            assert video_progress["desf_none"]["status"] == "sin_video"
            assert get_output_path("desf_none") is None
            assert db_get_videoclip_oficial("desf_none") == (True, None)
        finally:
            delete_video("desf_none")
            video_progress.pop("desf_none", None)
            _FakeYdl.instances.clear()


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
