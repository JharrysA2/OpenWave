"""Tests para routes/streaming.py — Archivos y prefetch de streaming."""

from unittest.mock import AsyncMock


class TestStreamFile:
    """Tests para GET /stream/{video_id} — servir archivo MP3."""

    def test_stream_file_not_found(self, client):
        """Solicitar archivo MP3 inexistente debe dar 404."""
        resp = client.get("/stream/nonexistent")
        assert resp.status_code == 404
        data = resp.json()
        assert "detail" in data

    def test_stream_file_found(self, client, mocker):
        """Solicitar archivo MP3 existente debe devolver FileResponse con audio/mpeg."""
        from config import MUSIC_DIR

        vid = "test_video_exists"
        mp3_path = MUSIC_DIR / f"{vid}.mp3"
        mp3_path.parent.mkdir(parents=True, exist_ok=True)
        mp3_path.write_bytes(b"fake mp3 binary content")

        try:
            resp = client.get(f"/stream/{vid}")
            assert resp.status_code == 200
            assert resp.headers["content-type"] == "audio/mpeg"
        finally:
            mp3_path.unlink(missing_ok=True)

    def test_stream_file_wrong_extension(self, client):
        """Extensiones fuera del allowlist de video_id no llegan al filesystem."""
        resp = client.get("/stream/archivo.txt")
        assert resp.status_code == 400

    def test_stream_file_traversal_rejected(self, client):
        """Path traversal en video_id debe rechazarse (CWE-22)."""
        # Vector Windows real: backslash como separador → llega al validador → 400
        resp = client.get("/stream/..\\..\\evil")
        assert resp.status_code == 400

        # Barras normales no llegan ni a la ruta: el router las rechaza
        for evil in ("../evil", "..%2F..%2Fevil", "a/../b"):
            resp = client.get(f"/stream/{evil}")
            assert resp.status_code in (400, 404), f"{evil} debería ser rechazado"


class TestStreamUrl:
    """Tests para GET /stream-url/{video_id} — obtener URL de streaming."""

    def test_stream_url_success(self, client, mocker):
        """Stream URL exitoso debe devolver url, headers y duration."""
        from unittest.mock import AsyncMock

        mock_get_url = mocker.patch(
            "routes.streaming.get_audio_url",
            new_callable=AsyncMock,
            return_value=("https://stream.example.com/audio", {"User-Agent": "test"}),
        )

        resp = client.get("/stream-url/test_video")
        assert resp.status_code == 200
        data = resp.json()
        assert data["url"] == "https://stream.example.com/audio"
        assert data["headers"] == {"User-Agent": "test"}
        assert data["duration"] == 0
        mock_get_url.assert_called_once_with("test_video", "standard")

    def test_stream_url_passes_quality(self, client, mocker):
        """El parámetro ?quality= se pasa tal cual a get_audio_url."""
        from unittest.mock import AsyncMock

        mock_get_url = mocker.patch(
            "routes.streaming.get_audio_url",
            new_callable=AsyncMock,
            return_value=("https://stream.example.com/audio", {}),
        )

        resp = client.get("/stream-url/test_video?quality=high")
        assert resp.status_code == 200
        mock_get_url.assert_called_once_with("test_video", "high")

    def test_stream_url_error(self, client, mocker):
        """Si get_audio_url falla, debe responder con 500."""
        from unittest.mock import AsyncMock

        mock_get_url = mocker.patch(
            "routes.streaming.get_audio_url",
            new_callable=AsyncMock,
            side_effect=RuntimeError("Stream extraction failed"),
        )

        resp = client.get("/stream-url/bad_video")
        assert resp.status_code == 500
        data = resp.json()
        assert "detail" in data
        assert "Stream extraction failed" in data["detail"]
        mock_get_url.assert_called_once_with("bad_video", "standard")


class TestStreamPrefetch:
    """Tests para GET /stream/prefetch/{video_id} — pre-carga en caché."""

    def test_prefetch_returns_ok(self, client, mocker):
        """Pre-cargar URL de stream debe responder con ok=True."""
        mock_prefetch = mocker.patch("routes.streaming.prefetch", return_value=None)
        resp = client.get("/stream/prefetch/test123")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        mock_prefetch.assert_called_once_with("test123", "standard")

    def test_prefetch_calls_prefetch_function(self, client, mocker):
        """Verificar que se llame a la función prefetch con el videoId correcto."""
        mock_prefetch = mocker.patch("routes.streaming.prefetch", return_value=None)
        client.get("/stream/prefetch/my_video_id")
        mock_prefetch.assert_called_once_with("my_video_id", "standard")


class TestStreamQualityLow:
    """Tests de la calidad de reproducción: Baja (M4A re-codificado local)."""

    def test_stream_url_low_returns_local_url(self, client, mocker):
        """?quality=low devuelve la URL local y calienta la construcción."""
        mock_get_url = mocker.patch(
            "routes.streaming.get_audio_url", new_callable=AsyncMock
        )
        mock_warm = mocker.patch("routes.streaming.warm_low_quality")

        resp = client.get("/stream-url/test_video?quality=low")
        assert resp.status_code == 200
        assert resp.json()["url"].endswith("/stream/quality/test_video")
        mock_warm.assert_called_once_with("test_video")
        mock_get_url.assert_not_called()

    def test_prefetch_low_warms_transcode(self, client, mocker):
        """prefetch con low calienta el re-codificado en vez de la URL."""
        mock_warm = mocker.patch("routes.streaming.warm_low_quality")
        mock_prefetch = mocker.patch("routes.streaming.prefetch")

        resp = client.get("/stream/prefetch/test123?quality=low")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        mock_warm.assert_called_once_with("test123")
        mock_prefetch.assert_not_called()

    def test_stream_quality_serves_built_file(self, client, mocker, tmp_path):
        """Con el archivo listo, lo sirve con media_type audio/mp4."""
        built = tmp_path / "low.64k.m4a"
        built.write_bytes(b"m4a-bytes")
        mocker.patch("routes.streaming.ensure_low_quality_sync", return_value=built)

        resp = client.get("/stream/quality/test_video")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/mp4"
        assert resp.content == b"m4a-bytes"

    def test_stream_quality_build_error_returns_502(self, client, mocker):
        """Si el re-codificado falla, responde 502 (el frontend cae al stream)."""
        mocker.patch(
            "routes.streaming.ensure_low_quality_sync",
            side_effect=RuntimeError("yt-dlp falló"),
        )
        resp = client.get("/stream/quality/test_video")
        assert resp.status_code == 502

    def test_stream_url_invalid_quality_falls_back(self, client, mocker):
        """Calidad fuera de la whitelist → se comporta como standard."""
        mock_get_url = mocker.patch(
            "routes.streaming.get_audio_url",
            new_callable=AsyncMock,
            return_value=("https://stream.example.com/audio", {}),
        )
        resp = client.get("/stream-url/test_video?quality=ultra")
        assert resp.status_code == 200
        mock_get_url.assert_called_once_with("test_video", "standard")


class TestStreamExists:
    """Tests para GET /stream/exists/{video_id} — calidad Alta (esperar descarga)."""

    def test_exists_false(self, client, mocker):
        from pathlib import Path

        mocker.patch(
            "routes.streaming.get_mp3_path",
            return_value=Path("/nonexistent/dir/abc.mp3"),
        )
        resp = client.get("/stream/exists/abc123")
        assert resp.status_code == 200
        assert resp.json() == {"exists": False}

    def test_exists_true(self, client, mocker, tmp_path):
        mp3 = tmp_path / "abc123.mp3"
        mp3.write_bytes(b"x")
        mocker.patch("routes.streaming.get_mp3_path", return_value=mp3)
        resp = client.get("/stream/exists/abc123")
        assert resp.status_code == 200
        assert resp.json() == {"exists": True}

    def test_exists_rejects_invalid_id(self, client):
        resp = client.get("/stream/exists/..\\..\\evil")
        assert resp.status_code == 400
