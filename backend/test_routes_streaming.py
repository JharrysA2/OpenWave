"""Tests para routes/streaming.py — Archivos y prefetch de streaming."""



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
        """Archivo con extensión incorrecta no debe ser servido como stream."""
        resp = client.get("/stream/archivo.txt")
        assert resp.status_code == 404


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
        mock_get_url.assert_called_once_with("test_video")

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
        mock_get_url.assert_called_once_with("bad_video")


class TestStreamPrefetch:
    """Tests para GET /stream/prefetch/{video_id} — pre-carga en caché."""

    def test_prefetch_returns_ok(self, client, mocker):
        """Pre-cargar URL de stream debe responder con ok=True."""
        mock_prefetch = mocker.patch("routes.streaming.prefetch", return_value=None)
        resp = client.get("/stream/prefetch/test123")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        mock_prefetch.assert_called_once_with("test123")

    def test_prefetch_calls_prefetch_function(self, client, mocker):
        """Verificar que se llame a la función prefetch con el videoId correcto."""
        mock_prefetch = mocker.patch("routes.streaming.prefetch", return_value=None)
        client.get("/stream/prefetch/my_video_id")
        mock_prefetch.assert_called_once_with("my_video_id")

