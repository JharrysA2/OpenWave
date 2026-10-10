"""Tests para main.py — Thumbnail proxy, health y warmup."""

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
        resp = client.get("/thumbnail-proxy?url=https://yt3.googleusercontent.com/test")
        assert resp.status_code != 403


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
        """Health check debe tener status ok y service OpenWave."""
        resp = client.get("/health")
        data = resp.json()
        assert data == {"status": "ok", "service": "OpenWave"}

    def test_health_response_method(self, client):
        """Solo GET debe funcionar, no POST."""
        resp = client.post("/health")
        assert resp.status_code == 405
        # Fuera del mapa de códigos: un 4xx tampoco se queda sin `code`
        assert resp.json()["code"] == "E-REQ-01"


class TestCorsOrigenEmpaquetado:
    """La app EMPAQUETADA corre en WebView2 sobre `http://tauri.localhost`.

    Sin ese origen en la lista CORS el fetch SÍ llega al backend (200), pero
    el navegador bloquea la lectura de la respuesta: api.js recibía un
    TypeError y la UI se quedaba en «E-CNX-01» CON el backend en marcha.
    Reproducido en las dos primeras pruebas reales del MSI.
    """

    ORIGEN_APP = "http://tauri.localhost"

    def test_health_permite_el_origen_de_la_app_instalada(self, client):
        resp = client.get("/health", headers={"Origin": self.ORIGEN_APP})
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == self.ORIGEN_APP

    def test_error_tambien_lleva_el_origen(self, client):
        """Las respuestas de error salen por otro handler: también deben poder
        leerse desde la app instalada."""
        resp = client.post("/health", headers={"Origin": self.ORIGEN_APP})
        assert resp.status_code == 405
        assert resp.headers.get("access-control-allow-origin") == self.ORIGEN_APP

    def test_origen_desconocido_no_se_permite(self, client):
        resp = client.get("/health", headers={"Origin": "http://evil.example"})
        assert "access-control-allow-origin" not in resp.headers


class TestErroresConCodigo:
    """Tests de los handlers globales: todo error lleva un `code` estable.

    El frontend muestra ese código (p. ej. E-INT-00) y el usuario lo cita al
    reportar el fallo, sin copiar mensajes ni estados HTTP. El `detail` de
    siempre se mantiene. Se usan rutas SIN rate limit para no consumir
    presupuesto de otros tests.
    """

    def test_error_400_lleva_code(self, client):
        """HTTPException(400) → detail + code E-REQ-01."""
        resp = client.get("/stream/archivo.txt")
        assert resp.status_code == 400
        data = resp.json()
        assert "detail" in data
        assert data["code"] == "E-REQ-01"

    def test_error_404_lleva_code(self, client):
        """HTTPException(404) → detail + code E-REQ-03."""
        resp = client.get("/stream/nonexistent")
        assert resp.status_code == 404
        data = resp.json()
        assert "detail" in data
        assert data["code"] == "E-REQ-03"

    def test_error_500_lleva_code(self, client):
        """HTTPException(500) de una ruta → detail + code E-INT-00."""
        resp = client.get("/stream-url/nonexistent")
        assert resp.status_code == 500
        data = resp.json()
        assert "detail" in data
        assert data["code"] == "E-INT-00"

    def test_mapa_de_codigos_nunca_deja_un_error_sin_code(self):
        """El mapa fija los códigos y el resto cae en un genérico."""
        from main import CODIGOS_ERROR, _codigo_error

        assert CODIGOS_ERROR == {
            400: "E-REQ-01",
            401: "E-REQ-02",
            403: "E-REQ-02",
            404: "E-REQ-03",
            429: "E-REQ-04",
            500: "E-INT-00",
            502: "E-SRV-01",
            503: "E-SRV-01",
        }
        assert _codigo_error(422) == "E-REQ-01"  # fuera del mapa → genérico 4xx
        assert _codigo_error(504) == "E-SRV-01"  # fuera del mapa → genérico 5xx

    def test_excepcion_no_controlada_responde_500_con_code(self):
        """El handler global de `Exception` también contesta con `code`."""
        from fastapi.testclient import TestClient
        from main import app

        async def _boom():
            raise RuntimeError("fallo interno simulado")

        app.add_api_route("/__test_boom", _boom, methods=["GET"])
        try:
            # raise_server_exceptions=False: Starlette re-lanza siempre la
            # excepción tras mandar la respuesta; aquí nos interesa ésta.
            resp = TestClient(app, raise_server_exceptions=False).get(
                "/__test_boom", headers={"Origin": "http://localhost:1420"}
            )
            assert resp.status_code == 500
            data = resp.json()
            assert data["code"] == "E-INT-00"
            assert "detail" in data
            # El detalle interno NO se filtra al cliente
            assert "fallo interno simulado" not in data["detail"]
            # Este 500 nace FUERA de CORSMiddleware: sin repetir la cabecera
            # el webview no podría leer el cuerpo (ni el `code`).
            assert (
                resp.headers["access-control-allow-origin"] == "http://localhost:1420"
            )
        finally:
            app.router.routes = [
                r
                for r in app.router.routes
                if getattr(r, "path", None) != "/__test_boom"
            ]

    async def test_rate_limit_429_lleva_code(self, mocker):
        """El 429 de slowapi conserva su payload y solo gana el `code`."""
        import json

        import main
        from fastapi import Request
        from fastapi.responses import JSONResponse

        original = JSONResponse(
            {"error": "Rate limit exceeded: 5 per 1 minute"},
            status_code=429,
            headers={"Retry-After": "42"},
        )
        mocker.patch.object(main, "_rate_limit_exceeded_handler", return_value=original)
        request = Request(
            {
                "type": "http",
                "method": "GET",
                "scheme": "http",
                "server": ("testserver", 80),
                "path": "/health",
                "query_string": b"",
                "headers": [],
                "root_path": "",
            }
        )
        resp = await main._manejo_rate_limit(request, RuntimeError("se ignora"))
        data = json.loads(resp.body)
        assert resp.status_code == 429
        assert data["code"] == "E-REQ-04"
        assert data["error"] == "Rate limit exceeded: 5 per 1 minute"
        assert resp.headers["Retry-After"] == "42"
        # content-length recalculado con el cuerpo nuevo
        assert int(resp.headers["content-length"]) == len(resp.body)
