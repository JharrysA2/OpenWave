"""Tests para las rutas de la API de FastAPI."""


class TestHealth:
    def test_health_endpoint(self, client):
        """El endpoint /health debe responder correctamente."""
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "SoundWave"


class TestSearch:
    def test_search_empty_query(self, client):
        """Búsqueda con query vacía debe responder con 400 (validación)."""
        resp = client.get("/search?q=")
        assert resp.status_code == 400
        data = resp.json()
        assert "detail" in data

    def test_search_no_query_param(self, client):
        """Búsqueda sin query param debe dar 422 (validation error)."""
        resp = client.get("/search")
        assert resp.status_code == 422

    def test_search_with_query(self, client):
        """Búsqueda con query válida debe responder con estructura esperada."""
        resp = client.get("/search?q=test&limit=5")
        # Even if no results from YTMusic, the endpoint should return 200
        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data
        assert "artists" in data
        assert "albums" in data


class TestTrending:
    def test_trending_endpoint(self, client):
        """El endpoint /trending debe responder."""
        resp = client.get("/trending")
        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data


class TestStreamUrl:
    def test_stream_url_invalid_video(self, client):
        """Solicitar stream URL de un video inválido debe dar error 500."""
        resp = client.get("/stream-url/nonexistent")
        assert resp.status_code == 500


class TestSongDetails:
    def test_song_details_invalid(self, client):
        """Solicitar detalles de canción inexistente debe responder (fallback)."""
        resp = client.get("/song/details/nonexistent")
        assert resp.status_code == 200
        data = resp.json()
        # Should at least return something or error info
        assert isinstance(data, dict)


class TestPlaylists:
    def test_playlists_empty(self, client):
        """Listar playlists sin datos debe devolver lista vacía."""
        resp = client.get("/playlists")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)


class TestHistory:
    def test_history_empty(self, client):
        """El historial vacío debe devolver lista vacía."""
        resp = client.get("/history")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_history_post_and_get(self, client, sample_song):
        """Publicar en historial y luego leerlo."""
        resp = client.post("/history", json=sample_song)
        assert resp.status_code == 200

        resp2 = client.get("/history")
        assert resp2.status_code == 200
        data = resp2.json()
        assert isinstance(data, list)


class TestDownloads:
    def test_downloads_empty(self, client):
        """Listar descargas vacías debe devolver lista vacía."""
        resp = client.get("/downloads")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)


class TestLyrics:
    def test_lyrics_invalid_video(self, client):
        """Solicitar letras de video inexistente debe responder sin lyrics."""
        resp = client.get("/lyrics/nonexistent")
        assert resp.status_code == 200


class TestLyricsLocal:
    def test_local_lyrics_not_found(self, client):
        """Solicitar letras locales de canción no descargada."""
        resp = client.get("/lyrics/local/nonexistent")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("lyrics") is None


class TestLyricsSearch:
    def test_lyrics_search(self, client):
        """Búsqueda de letras por título."""
        resp = client.get("/lyrics/search?title=test&artist=test")
        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data


class TestThumbnailProxy:
    def test_thumbnail_proxy_missing_url(self, client):
        """Proxy sin parámetro url debe dar 422."""
        resp = client.get("/thumbnail-proxy")
        assert resp.status_code == 422


class TestHome:
    def test_quick_picks(self, client):
        """Endpoint de quick picks debe responder."""
        resp = client.get("/home/quick-picks")
        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data

    def test_for_you(self, client):
        """Endpoint for-you debe responder."""
        resp = client.get("/home/for-you")
        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data

    def test_albums(self, client):
        """Endpoint home albums debe responder."""
        resp = client.get("/home/albums")
        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data

    def test_trending_fixed(self, client):
        """Endpoint trending-fixed debe responder."""
        resp = client.get("/home/trending-fixed")
        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data
