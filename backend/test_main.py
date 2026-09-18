"""Tests para main.py — Thumbnail proxy, extracción de colores, health y warmup."""

from unittest.mock import MagicMock


class TestThumbnailProxy:
    """Tests para GET /thumbnail-proxy — proxy de imagenes."""

    def test_missing_url_param(self, client):
        """Proxy sin parametro url debe dar 422."""
        resp = client.get("/thumbnail-proxy")
        assert resp.status_code == 422

    def test_blocked_url(self, client):
        """URL no permitida debe ser rechazada con 403."""
        resp = client.get("/thumbnail-proxy?url=https://evil.com/image.jpg")
        assert resp.status_code == 403
        data = resp.json()
        assert "error" in data
        assert data["error"] == "URL no permitida"

    def test_blocked_http_url(self, client):
        """URL http (no https) debe ser rechazada."""
        resp = client.get("/thumbnail-proxy?url=http://i.ytimg.com/image.jpg")
        assert resp.status_code == 403

    def test_allowed_ytimg_url_format(self, client):
        """URL de i.ytimg.com debe pasar la whitelist."""
        resp = client.get(
            "/thumbnail-proxy?url=https://i.ytimg.com/vi/test123/mqdefault.jpg"
        )
        assert resp.status_code != 403

    def test_allowed_googleusercontent(self, client):
        """URL de googleusercontent debe pasar la whitelist."""
        resp = client.get(
            "/thumbnail-proxy?url=https://lh3.googleusercontent.com/test=h120"
        )
        assert resp.status_code != 403

    def test_allowed_yt3(self, client):
        """URL de yt3.googleusercontent.com debe pasar la whitelist."""
        resp = client.get(
            "/thumbnail-proxy?url=https://yt3.googleusercontent.com/test"
        )
        assert resp.status_code != 403


class TestExtractColors:
    """Tests para GET /extract-colors/{video_id} — extraccion de colores."""

    def test_extract_colors_returns_colors_key(self, client, mocker):
        """Debe devolver un dict con la clave 'colors' en caso de error."""
        mock_ytm = MagicMock()
        mock_ytm.get_song.return_value = {
            "videoDetails": {
                "thumbnail": {
                    "thumbnails": [
                        {"url": "https://lh3.googleusercontent.com/test", "width": 120, "height": 120}
                    ]
                }
            }
        }
        mocker.patch("ytmusic_client.get_ytm", return_value=mock_ytm)
        mocker.patch("main.urllib.request.urlopen", side_effect=Exception("no network"))

        resp = client.get("/extract-colors/test123")
        assert resp.status_code == 200
        data = resp.json()
        assert "colors" in data
        assert isinstance(data["colors"], list)
        assert len(data["colors"]) > 0

    def test_extract_colors_fallback_on_error(self, client, mocker):
        """Cuando hay un error, debe devolver colores por defecto."""
        mocker.patch("ytmusic_client.get_ytm", side_effect=Exception("API error"))

        resp = client.get("/extract-colors/test123")
        assert resp.status_code == 200
        data = resp.json()
        assert data["colors"] == ["#a78bfa", "#7c3aed"]

    def test_extract_colors_no_thumbnail(self, client, mocker):
        """Sin thumbnail, debe devolver colores por defecto."""
        mock_ytm = MagicMock()
        mock_ytm.get_song.return_value = {
            "videoDetails": {"thumbnail": {"thumbnails": []}}
        }
        mocker.patch("ytmusic_client.get_ytm", return_value=mock_ytm)

        resp = client.get("/extract-colors/test123")
        assert resp.status_code == 200
        data = resp.json()
        assert data["colors"] == ["#a78bfa", "#7c3aed"]

    def test_extract_colors_invalid_video_id(self, client, mocker):
        """Video ID invalido debe devolver fallback."""
        mocker.patch("ytmusic_client.get_ytm", side_effect=Exception("not found"))

        resp = client.get("/extract-colors/nonexistent")
        assert resp.status_code == 200
        data = resp.json()
        assert "colors" in data


class TestExtractColorsAdvanced:
    """Tests avanzados para extract-colors — logica de procesamiento de pixeles."""

    def _make_test_image_bytes(self, color_or_fn):
        """Crear una imagen PNG de 32x32 en memoria."""
        import io

        from PIL import Image

        if callable(color_or_fn):
            img = Image.new("RGB", (32, 32))
            pixels = img.load()
            color_or_fn(pixels, 32)
        else:
            img = Image.new("RGB", (32, 32), color=color_or_fn)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    def _mock_extract_colors(self, mocker, img_bytes):
        """Configurar mocks para extract-colors con una imagen dada."""
        mock_ytm = MagicMock()
        mock_ytm.get_song.return_value = {
            "videoDetails": {
                "thumbnail": {
                    "thumbnails": [
                        {"url": "https://i.ytimg.com/vi/test123/hqdefault.jpg", "width": 480, "height": 360}
                    ]
                }
            }
        }
        mocker.patch("ytmusic_client.get_ytm", return_value=mock_ytm)

        mock_resp = MagicMock()
        mock_resp.__enter__.return_value.read.return_value = img_bytes
        mocker.patch("main.urllib.request.urlopen", return_value=mock_resp)

    def test_extract_colors_with_real_image(self, client, mocker):
        """Con imagen real de 3 colores, debe extraerlos correctamente."""
        def draw(pixels, size):
            for x in range(size):
                for y in range(size):
                    if y < 11:
                        pixels[x, y] = (180, 50, 50)
                    elif y < 22:
                        pixels[x, y] = (50, 180, 50)
                    else:
                        pixels[x, y] = (50, 50, 180)

        img_bytes = self._make_test_image_bytes(draw)
        self._mock_extract_colors(mocker, img_bytes)

        resp = client.get("/extract-colors/test123")
        assert resp.status_code == 200
        data = resp.json()
        assert "colors" in data
        assert len(data["colors"]) >= 1
        for color in data["colors"]:
            assert color.startswith("#")
            assert len(color) == 7

    def test_extract_colors_dark_pixels_filtered(self, client, mocker):
        """ Pixeles muy oscuros deben filtrarse y devolver fallback."""
        img_bytes = self._make_test_image_bytes((0, 0, 0))
        self._mock_extract_colors(mocker, img_bytes)

        resp = client.get("/extract-colors/dark_test")
        assert resp.status_code == 200
        data = resp.json()
        assert data["colors"] == ["#a78bfa", "#7c3aed"]

    def test_extract_colors_bright_pixels_filtered(self, client, mocker):
        """Pixeles muy brillantes deben filtrarse y devolver fallback."""
        img_bytes = self._make_test_image_bytes((250, 250, 250))
        self._mock_extract_colors(mocker, img_bytes)

        resp = client.get("/extract-colors/bright_test")
        assert resp.status_code == 200
        data = resp.json()
        assert data["colors"] == ["#a78bfa", "#7c3aed"]


class TestWarmup:
    """Tests para _startup_warmup — precarga de trending en background.

    Nota: _startup_warmup() usa imports locales dentro de la funcion:
      - from ytmusic_client import get_ytm
      - from cache import api_cache_set
    Por eso los mocks apuntan a esos modulos, no a main.*
    """

    def test_warmup_trending_caching(self, mocker):
        """Warmup debe cachear trending charts cuando hay datos."""
        mocker.patch("main.time.sleep")
        mock_logger_info = mocker.patch("main.logger.info")

        mock_charts = {
            "songs": {
                "items": [
                    {"videoId": "v1", "title": "Song 1"},
                    {"videoId": "v2", "title": "Song 2"},
                ]
            }
        }
        mock_ytm = MagicMock()
        mock_ytm.get_charts.return_value = mock_charts
        mocker.patch("ytmusic_client.get_ytm", return_value=mock_ytm)

        from main import _startup_warmup
        _startup_warmup()

        # logger.info se llama justo despues de api_cache_set
        mock_logger_info.assert_called_once_with(
            "warmup \u2713 %d trending songs cached", 2
        )

    def test_warmup_trending_error(self, mocker):
        """Si get_charts falla, warmup debe capturar la excepcion."""
        mocker.patch("main.time.sleep")
        mocker.patch(
            "ytmusic_client.get_ytm", side_effect=Exception("charts API error")
        )
        mock_logger = mocker.patch("main.logger.warning")

        from main import _startup_warmup
        _startup_warmup()

        assert mock_logger.call_count >= 1

    def test_warmup_trending_no_songs_data(self, mocker):
        """Si charts no tiene songs data, no debe cachear."""
        mocker.patch("main.time.sleep")
        mock_logger_info = mocker.patch("main.logger.info")

        mock_ytm = MagicMock()
        mock_ytm.get_charts.return_value = {"videos": {"items": []}}
        mocker.patch("ytmusic_client.get_ytm", return_value=mock_ytm)

        from main import _startup_warmup
        _startup_warmup()

        # logger.info NO debe llamarse porque no hay datos de songs
        mock_logger_info.assert_not_called()


class TestWarmupThread:
    """Tests para la linea 191: threading.Thread(target=_startup_warmup, daemon=True).start()"""

    def test_warmup_thread_started_as_daemon(self, mocker):
        """Al importar main, se debe crear un Thread daemon con _startup_warmup."""
        import importlib

        import main as main_mod

        mock_thread_class = mocker.patch("threading.Thread")
        importlib.reload(main_mod)

        mock_thread_class.assert_called_once_with(
            target=main_mod._startup_warmup, daemon=True
        )
        # Verificar que se llamo a .start() en la instancia
        mock_thread_class.return_value.start.assert_called_once()


class TestHealth:
    """Tests para GET /health — health check."""

    def test_health_endpoint_exists(self, client):
        """Health check debe responder 200."""
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_health_response_structure(self, client):
        """Health check debe tener status ok y service SoundWave."""
        resp = client.get("/health")
        data = resp.json()
        assert data == {"status": "ok", "service": "SoundWave"}

    def test_health_response_method(self, client):
        """Solo GET debe funcionar, no POST."""
        resp = client.post("/health")
        assert resp.status_code == 405
