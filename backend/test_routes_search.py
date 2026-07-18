"""Tests para routes/search.py — Búsqueda de videos, trending y home."""

from unittest.mock import MagicMock, patch

from db import get_db


class TestSearch:
    """Tests para GET /search — búsqueda de canciones, artistas y álbumes."""

    def test_search_empty_query(self, client):
        """Query vacía debe responder con 400."""
        resp = client.get("/search?q=")
        assert resp.status_code == 400
        data = resp.json()
        assert "detail" in data

    def test_search_no_query_param(self, client):
        """Sin query param debe dar 422."""
        resp = client.get("/search")
        assert resp.status_code == 422

    def test_search_cache_hit(self, client):
        """Datos cacheados deben devolverse sin llamar a YTMusic."""
        from cache import api_cache_set

        cached = {"results": [{"videoId": "cached_song"}], "artists": [], "albums": []}
        api_cache_set("search2:cached_query", cached)

        resp = client.get("/search?q=cached_query")
        assert resp.status_code == 200
        data = resp.json()
        assert data["results"][0]["videoId"] == "cached_song"

    @patch("routes.search.get_ytm")
    def test_search_with_songs_artists_albums(self, mock_get_ytm, client):
        """Búsqueda exitosa debe devolver canciones, artistas y álbumes."""
        mock_ytm = MagicMock()
        mock_ytm.search.side_effect = [
            # Songs
            [
                {
                    "resultType": "song",
                    "videoId": "song1",
                    "title": "Test Song",
                    "artists": [{"name": "Test Artist"}],
                    "duration_seconds": 200,
                },
                {"resultType": "video", "videoId": "skip_me"},  # filtered out
            ],
            # Artists
            [
                {
                    "resultType": "artist",
                    "browseId": "artist_1",
                    "artist": "Test Artist",
                    "subscribers": "1M",
                    "thumbnails": [
                        {
                            "url": "https://lh3.googleusercontent.com/abc=h100",
                            "width": 100,
                            "height": 100,
                        }
                    ],
                }
            ],
            # Albums
            [
                {
                    "resultType": "album",
                    "browseId": "album_1",
                    "title": "Test Album",
                    "artists": [{"name": "Test Artist"}],
                    "year": "2024",
                    "type": "Album",
                    "thumbnails": [
                        {"url": "https://example.com/thumb.jpg", "width": 100, "height": 100}
                    ],
                }
            ],
        ]
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/search?q=complete_test")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["results"]) == 1
        assert data["results"][0]["videoId"] == "song1"
        assert len(data["artists"]) == 1
        assert data["artists"][0]["browseId"] == "artist_1"
        assert "=w576-h576-l90-rj" in data["artists"][0]["thumbnail"]
        assert len(data["albums"]) == 1
        assert data["albums"][0]["browseId"] == "album_1"

    @patch("routes.search.get_ytm")
    def test_search_artist_no_thumbnails(self, mock_get_ytm, client):
        """Artista sin thumbnails debe devolver thumbnail vacío."""
        mock_ytm = MagicMock()
        mock_ytm.search.side_effect = [
            [],  # songs
            [
                {
                    "resultType": "artist",
                    "browseId": "no_thumb",
                    "name": "No Thumb Artist",
                    "thumbnails": [],
                }
            ],
            [],  # albums
        ]
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/search?q=no_thumb")
        assert resp.status_code == 200
        data = resp.json()
        assert data["artists"][0]["thumbnail"] == ""
        assert data["artists"][0]["thumbnails"] == []

    @patch("routes.search.get_ytm")
    def test_search_album_single_type(self, mock_get_ytm, client):
        """Álbumes de tipo single/ep deben incluirse."""
        mock_ytm = MagicMock()
        mock_ytm.search.side_effect = [
            [],  # songs
            [],  # artists
            [
                {
                    "resultType": "single",
                    "browseId": "single_1",
                    "title": "Single Track",
                    "artists": [{"name": "Artist"}],
                    "year": "2024",
                    "type": "Single",
                    "thumbnails": [],
                },
                {
                    "resultType": "ep",
                    "browseId": "ep_1",
                    "title": "EP Track",
                    "year": "2023",
                    "type": "EP",
                    "thumbnails": [],
                },
                {"resultType": "playlist", "browseId": "pl_1"},  # filtered out
            ],
        ]
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/search?q=singles")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["albums"]) == 2
        assert data["albums"][0]["type"] == "Single"
        assert data["albums"][1]["type"] == "EP"

    @patch("routes.search.get_ytm")
    def test_search_artist_name_from_field(self, mock_get_ytm, client):
        """Artista puede tener name en vez de artist."""
        mock_ytm = MagicMock()
        mock_ytm.search.side_effect = [
            [],
            [
                {
                    "resultType": "artist",
                    "browseId": "artist_n",
                    "name": "Name Field Artist",
                    "thumbnails": [],
                }
            ],
            [],
        ]
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/search?q=artist_name")
        assert resp.status_code == 200
        data = resp.json()
        assert data["artists"][0]["name"] == "Name Field Artist"


class TestSearchVideos:
    """Tests para GET /search/videos — búsqueda de videos con yt-dlp."""

    def test_search_videos_cache_hit(self, client):
        """Datos cacheados de videos deben devolverse."""
        from cache import api_cache_set

        cached = {"results": [{"videoId": "cached_vid", "isVideo": True}]}
        api_cache_set("search_videos:cached_q", cached)

        resp = client.get("/search/videos?q=cached_q")
        assert resp.status_code == 200
        data = resp.json()
        assert data["results"][0]["videoId"] == "cached_vid"

    def test_search_videos_empty_query(self, client):
        """Búsqueda de videos con query vacía debe responder 200 con results vacío."""
        resp = client.get("/search/videos?q=")
        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data

    def test_search_videos_no_query_param(self, client):
        """Búsqueda de videos sin query param debe dar 422 (validation error)."""
        resp = client.get("/search/videos")
        assert resp.status_code == 422

    def test_search_videos_handles_ytdlp_error(self, client, mocker):
        """Si yt-dlp falla, debe devolver results vacío con error."""
        mocker.patch(
            "yt_dlp.YoutubeDL",
            side_effect=Exception("yt-dlp connection error"),
        )
        resp = client.get("/search/videos?q=error_test")
        assert resp.status_code == 200
        data = resp.json()
        assert data == {"results": [], "error": "yt-dlp connection error"}

    def test_search_videos_returns_results_key_on_error(self, client, mocker):
        """Incluso con error de yt-dlp, debe devolver la clave results."""
        mocker.patch(
            "yt_dlp.YoutubeDL",
            side_effect=Exception("network error"),
        )
        resp = client.get("/search/videos?q=error_case")
        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data


class TestTrending:
    """Tests para GET /trending."""

    def test_trending_cache_hit(self, client):
        """Trending cachead debe devolverse sin llamar a YTMusic."""
        from cache import api_cache_set

        api_cache_set("trending", [{"videoId": "cached_trend"}])

        resp = client.get("/trending")
        assert resp.status_code == 200
        data = resp.json()
        assert data["results"][0]["videoId"] == "cached_trend"

    @patch("routes.search.get_ytm")
    def test_trending_with_songs_key(self, mock_get_ytm, client):
        """Trending con key 'songs' debe parsear correctamente."""
        mock_ytm = MagicMock()
        mock_ytm.get_charts.return_value = {
            "songs": {
                "items": [
                    {
                        "videoId": "trend1",
                        "title": "Trending Song",
                        "artists": [{"name": "Trend Artist"}],
                        "duration_seconds": 180,
                        "thumbnails": [{"url": "thumb.jpg", "width": 100, "height": 100}],
                    }
                ]
            }
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/trending?country=US")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["results"]) == 1
        assert data["results"][0]["videoId"] == "trend1"

    @patch("routes.search.get_ytm")
    def test_trending_with_top_songs_key(self, mock_get_ytm, client):
        """Trending con key 'topSongs' debe parsear."""
        mock_ytm = MagicMock()
        mock_ytm.get_charts.return_value = {
            "topSongs": {
                "content": [
                    {
                        "videoId": "top1",
                        "title": "Top Song",
                        "artists": "Solo Artist",
                        "duration_seconds": 200,
                        "thumbnails": [],
                    }
                ]
            }
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/trending?country=MX")
        assert resp.status_code == 200
        data = resp.json()
        # Artist is a string, parsed directly
        assert data["results"][0]["artist"] == "Solo Artist"

    @patch("routes.search.get_ytm")
    def test_trending_fallback_to_second_attempt(self, mock_get_ytm, client):
        """Si primer intento falla, debe intentar sin país."""
        mock_ytm = MagicMock()
        mock_ytm.get_charts.side_effect = [
            Exception("country fail"),
            {
                "songs": {
                    "items": [
                        {
                            "videoId": "fallback",
                            "title": "Fallback Song",
                            "artists": [{"name": "Artist"}],
                            "duration_seconds": 180,
                            "thumbnails": [],
                        }
                    ]
                }
            },
        ]
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/trending?country=XX")
        assert resp.status_code == 200
        data = resp.json()
        assert data["results"][0]["videoId"] == "fallback"

    @patch("routes.search.get_ytm")
    def test_trending_error_returns_cached(self, mock_get_ytm, client):
        """Si todo falla, debe devolver datos cacheados si existen."""
        from cache import api_cache_set

        api_cache_set("trending", [{"videoId": "cached_fallback"}])

        mock_ytm = MagicMock()
        mock_ytm.get_charts.side_effect = [
            Exception("fail1"),
            Exception("fail2"),
        ]
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/trending?country=XX")
        assert resp.status_code == 200
        data = resp.json()
        assert data["results"][0]["videoId"] == "cached_fallback"

    @patch("routes.search.get_ytm")
    def test_trending_list_response_falls_back(self, mock_get_ytm, client):
        """Si get_charts devuelve una lista (no dict), debe caer a cache."""
        from cache import api_cache_set

        api_cache_set("trending", [{"videoId": "fallback_from_cache"}])

        mock_ytm = MagicMock()
        mock_ytm.get_charts.return_value = [
            {
                "videoId": "list_item",
                "title": "From List",
                "artists": [{"name": "Artist"}],
                "duration_seconds": 150,
                "thumbnails": [],
            }
        ]
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/trending")
        assert resp.status_code == 200
        data = resp.json()
        # charts.get(key) fails on list -> exception -> songs=[] -> fallback to cached
        assert data["results"][0]["videoId"] == "fallback_from_cache"

    @patch("routes.search.get_ytm")
    def test_trending_deep_search(self, mock_get_ytm, client):
        """Búsqueda profunda: recorrer valores del dict si candidates vacío."""
        mock_ytm = MagicMock()
        mock_ytm.get_charts.return_value = {
            "unknown_key": {
                "items": [
                    {
                        "videoId": "deep_vid",
                        "title": "Deep Found",
                        "artists": [{"name": "Artist"}],
                        "duration_seconds": 180,
                        "thumbnails": [],
                    }
                ]
            }
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/trending")
        assert resp.status_code == 200
        data = resp.json()
        assert data["results"][0]["videoId"] == "deep_vid"


class TestHomeQuickPicks:
    """Tests para GET /home/quick-picks."""

    def test_quick_picks_empty_history_returns_empty(self, client):
        """Sin historial, quick picks debe devolver lista vacía."""
        resp = client.get("/home/quick-picks")
        data = resp.json()
        assert isinstance(data["results"], list)
        assert len(data["results"]) == 0

    def test_quick_picks_cache_hit(self, client):
        """Quick picks cachead debe devolverse sin consultar BD."""
        from cache import api_cache_set

        cached = [{"videoId": "cached_qp", "title": "Cached"}]
        api_cache_set("home:quick-picks", cached)

        resp = client.get("/home/quick-picks")
        data = resp.json()
        assert data["results"][0]["videoId"] == "cached_qp"

    def test_quick_picks_with_history(self, client):
        """Con historial, quick picks debe devolver canciones ordenadas."""
        with get_db() as conn:
            conn.execute(
                "INSERT INTO history (video_id, title, artist, thumbnail, duration, play_count, last_played_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("hist1", "History Song", "Hist Artist", "thumb.jpg", 200, 5, "2024-01-01"),
            )
            conn.execute(
                "INSERT INTO history (video_id, title, artist, thumbnail, duration, play_count, last_played_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("hist2", "Another Song", "Other Artist", "thumb2.jpg", 180, 3, "2024-01-02"),
            )

        try:
            resp = client.get("/home/quick-picks")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["results"]) >= 2
            ids = [s["videoId"] for s in data["results"]]
            assert "hist1" in ids
            assert "hist2" in ids
        finally:
            with get_db() as conn:
                conn.execute("DELETE FROM history")

    def test_quick_picks_dedup_similar_titles(self, client):
        """Títulos similares (con feat.) deben deduplicarse."""
        with get_db() as conn:
            conn.execute(
                "INSERT INTO history (video_id, title, artist, thumbnail, duration, play_count, last_played_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("orig1", "Song Title", "Artist", "t.jpg", 200, 5, "2024-01-01"),
            )
            conn.execute(
                "INSERT INTO history (video_id, title, artist, thumbnail, duration, play_count, last_played_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("orig2", "Song Title (feat. Someone)", "Artist", "t2.jpg", 200, 3, "2024-01-02"),
            )

        try:
            resp = client.get("/home/quick-picks")
            assert resp.status_code == 200
            data = resp.json()
            # Deduped: only one should remain
            # orig2 (2024-01-02) aparece primero (ORDER BY last_played_at DESC)
            # orig1 (2024-01-01) se salta porque norm ya está en seen_titles
            assert len(data["results"]) == 1
        finally:
            with get_db() as conn:
                conn.execute("DELETE FROM history")


class TestHomeForYou:
    """Tests para GET /home/for-you."""

    def test_for_you_cache_hit(self, client):
        """For-you cachead debe devolverse sin consultar BD."""
        from cache import api_cache_set

        api_cache_set("home:for-you", [{"videoId": "cached_fy"}])

        resp = client.get("/home/for-you")
        data = resp.json()
        assert data["results"][0]["videoId"] == "cached_fy"

    def test_for_you_empty_history_returns_empty(self, client):
        """Sin historial ni trending cachead, for-you devuelve vacío."""
        resp = client.get("/home/for-you")
        data = resp.json()
        assert data["results"] == []

    def test_for_you_empty_history_with_trending_cache(self, client):
        """Sin historial pero con trending cachead, for-you usa trending."""
        from cache import api_cache_set

        api_cache_set("trending", [{"videoId": "trend_fallback"}])

        resp = client.get("/home/for-you")
        data = resp.json()
        assert data["results"][0]["videoId"] == "trend_fallback"

    @patch("routes.search.get_ytm")
    def test_for_you_with_history(self, mock_get_ytm, client):
        """Con historial, for-you debe buscar canciones por artista."""
        with get_db() as conn:
            conn.execute(
                "INSERT INTO history (video_id, title, artist, thumbnail, duration, play_count, last_played_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("fy_hist", "Hist Song", "Search Artist", "t.jpg", 200, 10, "2024-01-01"),
            )

        mock_ytm = MagicMock()
        mock_ytm.search.return_value = [
            {
                "resultType": "song",
                "videoId": "recommended",
                "title": "Recommended",
                "artists": [{"name": "Search Artist"}],
                "duration_seconds": 180,
            }
        ]
        mock_get_ytm.return_value = mock_ytm

        try:
            resp = client.get("/home/for-you")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["results"]) >= 1
            ids = [s["videoId"] for s in data["results"]]
            assert "recommended" in ids
        finally:
            with get_db() as conn:
                conn.execute("DELETE FROM history")

    @patch("routes.search.get_ytm")
    def test_for_you_fallback_to_recent_history(self, mock_get_ytm, client):
        """Si search falla para todos los artistas, debe caer a historial reciente."""
        with get_db() as conn:
            conn.execute(
                "INSERT INTO history (video_id, title, artist, thumbnail, duration, play_count, last_played_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("fy_fb", "Recent Song", "Fail Artist", "t.jpg", 200, 5, "2024-01-01"),
            )

        mock_ytm = MagicMock()
        mock_ytm.search.side_effect = Exception("search always fails")
        mock_get_ytm.return_value = mock_ytm

        try:
            resp = client.get("/home/for-you")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["results"]) >= 1
            ids = [s["videoId"] for s in data["results"]]
            assert "fy_fb" in ids
        finally:
            with get_db() as conn:
                conn.execute("DELETE FROM history")


class TestHomeAlbums:
    """Tests para GET /home/albums."""

    def test_home_albums_cache_hit(self, client):
        """Albums cachead debe devolverse sin consultar BD."""
        from cache import api_cache_set

        api_cache_set("home:albums", [{"browseId": "cached_alb"}])

        resp = client.get("/home/albums")
        data = resp.json()
        assert data["results"][0]["browseId"] == "cached_alb"

    def test_home_albums_empty_history(self, client):
        """Sin historial, albums devuelve vacío."""
        resp = client.get("/home/albums")
        data = resp.json()
        assert data["results"] == []

    @patch("routes.search.get_ytm")
    def test_home_albums_with_history(self, mock_get_ytm, client):
        """Con historial, albums debe buscar álbumes por artista."""
        with get_db() as conn:
            conn.execute(
                "INSERT INTO history (video_id, title, artist, thumbnail, duration, play_count, last_played_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("alb_hist", "Hist Song", "Alb Artist", "t.jpg", 200, 10, "2024-01-01"),
            )

        mock_ytm = MagicMock()
        mock_ytm.search.return_value = [
            {
                "browseId": "found_album",
                "title": "Found Album",
                "artists": [{"name": "Alb Artist"}],
                "year": "2024",
                "type": "Album",
                "thumbnails": [{"url": "https://example.com/alb.jpg", "width": 100, "height": 100}],
            },
            {"browseId": "", "title": "No Id"},  # filtered: empty browseId
            {"title": "No BrowseId"},  # filtered: no browseId key
        ]
        mock_get_ytm.return_value = mock_ytm

        try:
            resp = client.get("/home/albums")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["results"]) == 1
            assert data["results"][0]["browseId"] == "found_album"
            assert data["results"][0]["title"] == "Found Album"
        finally:
            with get_db() as conn:
                conn.execute("DELETE FROM history")

    @patch("routes.search.get_ytm")
    def test_home_albums_search_error(self, mock_get_ytm, client):
        """Error en search de álbumes no debe romper el endpoint."""
        with get_db() as conn:
            conn.execute(
                "INSERT INTO history (video_id, title, artist, thumbnail, duration, play_count, last_played_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("alb_err", "Song", "Error Artist", "t.jpg", 200, 5, "2024-01-01"),
            )

        mock_ytm = MagicMock()
        mock_ytm.search.side_effect = Exception("search failed")
        mock_get_ytm.return_value = mock_ytm

        try:
            resp = client.get("/home/albums")
            assert resp.status_code == 200
            data = resp.json()
            assert isinstance(data["results"], list)
        finally:
            with get_db() as conn:
                conn.execute("DELETE FROM history")

    @patch("routes.search.get_ytm")
    def test_home_albums_artist_name_with_comma(self, mock_get_ytm, client):
        """Artista con coma en nombre debe usar primera parte para buscar."""
        with get_db() as conn:
            conn.execute(
                "INSERT INTO history (video_id, title, artist, thumbnail, duration, play_count, last_played_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("alb_cma", "Song", "Primary Artist, Secondary Artist", "t.jpg", 200, 5, "2024-01-01"),
            )

        mock_ytm = MagicMock()
        mock_ytm.search.return_value = []
        mock_get_ytm.return_value = mock_ytm

        try:
            resp = client.get("/home/albums")
            assert resp.status_code == 200
            data = resp.json()
            assert isinstance(data["results"], list)
            # Verificar que search se llamó con "Primary Artist" (primera parte)
            mock_ytm.search.assert_called_once_with("Primary Artist", filter="albums", limit=4)
        finally:
            with get_db() as conn:
                conn.execute("DELETE FROM history")


class TestHomeTrendingFixed:
    """Tests para GET /home/trending-fixed."""

    def test_trending_fixed_empty_result(self, client):
        """Sin conexión, trending-fixed debe devolver lista vacía."""
        resp = client.get("/home/trending-fixed")
        data = resp.json()
        assert isinstance(data["results"], list)

    @patch("routes.search.get_ytm")
    def test_trending_fixed_with_countries(self, mock_get_ytm, client):
        """Trending-fixed debe probar múltiples países."""
        mock_ytm = MagicMock()
        # First 3 fail (GT, MX, US), 4th succeeds (None)
        mock_ytm.get_charts.side_effect = [
            Exception("GT fail"),
            Exception("MX fail"),
            Exception("US fail"),
            {
                "songs": {
                    "items": [
                        {
                            "videoId": "default_country",
                            "title": "Default Country",
                            "artists": [{"name": "Artist"}],
                            "duration_seconds": 180,
                            "thumbnails": [],
                        }
                    ]
                }
            },
        ]
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/home/trending-fixed")
        assert resp.status_code == 200
        data = resp.json()
        assert data["results"][0]["videoId"] == "default_country"

    @patch("routes.search.get_ytm")
    def test_trending_fixed_deep_search(self, mock_get_ytm, client):
        """Trending-fixed con key desconocida debe buscar en valores del dict."""
        mock_ytm = MagicMock()
        mock_ytm.get_charts.return_value = {
            "custom_section": {
                "content": [
                    {
                        "videoId": "deep_tf",
                        "title": "Deep TF",
                        "artists": [{"name": "Artist"}],
                        "duration_seconds": 180,
                        "thumbnails": [],
                    }
                ]
            }
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/home/trending-fixed")
        assert resp.status_code == 200
        data = resp.json()
        assert data["results"][0]["videoId"] == "deep_tf"

    @patch("routes.search.get_ytm")
    def test_trending_fixed_artist_string_vs_list(self, mock_get_ytm, client):
        """Artista como string debe parsearse correctamente."""
        mock_ytm = MagicMock()
        mock_ytm.get_charts.return_value = {
            "songs": {
                "items": [
                    {
                        "videoId": "str_artist",
                        "title": "Str Artist",
                        "artists": "Solo Artist",
                        "duration_seconds": 180,
                        "thumbnails": [],
                    }
                ]
            }
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/home/trending-fixed")
        assert resp.status_code == 200
        data = resp.json()
        assert data["results"][0]["artist"] == "Solo Artist"

    @patch("routes.search.get_ytm")
    def test_trending_fixed_caches_results(self, mock_get_ytm, client):
        """Resultados exitosos deben guardarse en caché."""
        from cache import api_cache

        mock_ytm = MagicMock()
        mock_ytm.get_charts.return_value = {
            "songs": {
                "items": [
                    {
                        "videoId": "cache_me",
                        "title": "Cache Me",
                        "artists": [{"name": "Artist"}],
                        "duration_seconds": 180,
                        "thumbnails": [],
                    }
                ]
            }
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/home/trending-fixed")
        assert resp.status_code == 200

        # Verify cache was set (api_cache stores (value, timestamp) tuples)
        cached = api_cache.get("trending")
        assert cached is not None
        # cached[0] is the value list, cached[1] is the timestamp
        assert cached[0][0]["videoId"] == "cache_me"

    @patch("routes.search.get_ytm")
    def test_trending_fixed_all_countries_fail(self, mock_get_ytm, client):
        """Si todos los países fallan, debe devolver lista vacía."""
        mock_ytm = MagicMock()
        mock_ytm.get_charts.side_effect = Exception("always fails")
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/home/trending-fixed")
        assert resp.status_code == 200
        data = resp.json()
        assert data["results"] == []
