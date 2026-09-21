"""Tests de seguridad — validación de video_id contra path traversal (CWE-22).

Verifica que ningún endpoint que recibe video_id y toca el filesystem
(streaming, descargas, letras locales, thumbnail, lookup) acepte IDs con
separadores de path. Un payload tipo "..\\..\\evil" debe devolver 400.
"""

from fastapi import HTTPException

from utils import get_mp3_path, is_valid_video_id, require_valid_video_id

# Payloads de path traversal probados en todos los endpoints con video_id
TRAVERSAL_PAYLOADS = [
    "..\\..\\evil",
    "..\\..\\..\\windows",
    r"..\evil",
    "evil\\..\\x",
]


class TestValidatorUnit:
    """Tests unitarios del validador compartido."""

    def test_valid_ids_accepted(self):
        """IDs reales de YouTube (11 chars) deben aceptarse."""
        for vid in ("dQw4w9WgXcQ", "abcdefghijk", "AAAAAAAAAAA", "abc-ABC_123"):
            assert is_valid_video_id(vid), vid

    def test_traversal_payloads_rejected(self):
        """Payloads con separadores deben rechazarse."""
        for evil in ("..\\..\\evil", "../evil", "a/b", "a.b", "i d", ":", ""):
            assert not is_valid_video_id(evil), repr(evil)

    def test_non_string_rejected(self):
        """No-strings (None, números) deben rechazarse."""
        assert not is_valid_video_id(None)
        assert not is_valid_video_id(12345)

    def test_overlong_rejected(self):
        """IDs absurdamente largos deben rechazarse."""
        assert not is_valid_video_id("a" * 81)

    def test_require_raises_http_400(self):
        """require_valid_video_id debe lanzar HTTPException 400."""
        try:
            require_valid_video_id("..\\..\\evil")
        except HTTPException as e:
            assert e.status_code == 400
        else:
            raise AssertionError("debería lanzar HTTPException")


class TestGetMp3PathSecurity:
    """get_mp3_path debe rehusar construir rutas fuera de MUSIC_DIR."""

    def test_valid_id_returns_path(self):
        import config

        paths = []
        for vid in ("dQw4w9WgXcQ", "abcdefghijk"):
            p = get_mp3_path(vid)
            assert str(p).startswith(str(config.MUSIC_DIR))
            paths.append(p)
        assert len(set(paths)) == 2

    def test_traversal_raises(self):
        for evil in TRAVERSAL_PAYLOADS:
            try:
                get_mp3_path(evil)
            except ValueError:
                continue
            raise AssertionError(f"get_mp3_path debería rechazar {evil!r}")


class TestEndpointsRejectTraversal:
    """Cada endpoint con video_id debe responder 400 ante payloads de traversa."""

    def test_stream_endpoints(self, client):
        for path in (
            "/stream/{v}",
            "/stream/play/{v}",
            "/stream-url/{v}",
            "/stream/prefetch/{v}",
        ):
            for evil in TRAVERSAL_PAYLOADS:
                resp = client.get(path.format(v=evil))
                assert resp.status_code == 400, f"{path} con {evil!r}"

    def test_download_endpoints(self, client):
        for evil in TRAVERSAL_PAYLOADS:
            resp = client.post(f"/download/{evil}", json={"title": "x"})
            assert resp.status_code == 400, f"/download con {evil!r}"

            resp = client.get(f"/download/progress/{evil}")
            assert resp.status_code == 400

            resp = client.delete(f"/downloads/{evil}")
            assert resp.status_code == 400

        resp = client.post("/downloads/delete", json={"videoIds": ["..\\..\\evil"]})
        assert resp.status_code == 400

    def test_lyrics_endpoints(self, client):
        for evil in TRAVERSAL_PAYLOADS:
            resp = client.get(f"/lyrics/local/{evil}")
            assert resp.status_code == 400

            resp = client.get(f"/lyrics/{evil}")
            assert resp.status_code == 400

    def test_song_and_queue_endpoints(self, client):
        for evil in TRAVERSAL_PAYLOADS:
            for path in (
                "/song/details/{v}",
                "/song/album/{v}",
                "/queue/{v}",
            ):
                resp = client.get(path.format(v=evil))
                assert resp.status_code == 400, f"{path} con {evil!r}"
