"""Tests para routes/songs.py — Álbumes, artistas, detalles y cola."""

from unittest.mock import MagicMock, patch


class TestSongDetails:
    """Tests para /song/details/{video_id}."""

    def test_song_details_invalid(self, client):
        """Solicitar detalles de canción inexistente debe responder."""
        resp = client.get("/song/details/nonexistent")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        assert data["videoId"] == "nonexistent"

    @patch("routes.songs.get_ytm")
    def test_song_details_with_valid_data(self, mock_get_ytm, client):
        """Detalles deben incluir título, vistas, artista cuando YTMusic responde."""
        mock_ytm = MagicMock()
        mock_ytm.get_song.return_value = {
            "videoDetails": {
                "title": "Test Song",
                "viewCount": "1500000",
                "likeCount": "42000",
            },
            "microformat": {
                "microformatDataRenderer": {"genre": "Rock"},
            },
        }
        mock_ytm.get_watch_playlist.return_value = {
            "tracks": [
                {
                    "videoId": "vid1",
                    "artists": [{"name": "Test Artist", "id": "artist_1"}],
                    "album": {"name": "Test Album", "year": "2024"},
                }
            ]
        }
        mock_ytm.search.return_value = [
            {"videoId": "vid1", "plays": "500K", "playCount": "500K"}
        ]
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/song/details/vid1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Test Song"
        assert data["artist"] == "Test Artist"
        assert data["album"] == "Test Album"
        assert data["year"] == "2024"
        assert data["genre"] == "Rock"

    @patch("routes.songs.get_ytm")
    def test_song_details_handles_error(self, mock_get_ytm, client):
        """Si YTMusic lanza error, debe devolver respuesta parcial."""
        mock_ytm = MagicMock()
        mock_ytm.get_song.side_effect = Exception("API error")
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/song/details/error_vid")
        assert resp.status_code == 200
        data = resp.json()
        assert data["videoId"] == "error_vid"


class TestSongAlbum:
    """Tests para /song/album/{video_id}."""

    @patch("routes.songs.get_ytm")
    def test_song_album_not_found(self, mock_get_ytm, client):
        """Si no se encuentra álbum, debe devolver error."""
        mock_ytm = MagicMock()
        mock_ytm.get_song.return_value = {
            "videoDetails": {"title": "Unknown", "author": "Unknown"}
        }
        mock_ytm.search.return_value = []
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/song/album/nonexistent")
        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data

    @patch("routes.songs.get_ytm")
    def test_song_album_found(self, mock_get_ytm, client):
        """Si se encuentra álbum, debe devolver datos del álbum."""
        mock_ytm = MagicMock()
        mock_ytm.get_song.return_value = {
            "videoDetails": {"title": "Test Song", "author": "Test Artist"}
        }
        mock_ytm.search.return_value = [
            {
                "videoId": "vid1",
                "album": {"id": "album_1", "name": "Test Album"},
            }
        ]
        mock_ytm.get_album.return_value = {
            "title": "Test Album",
            "artists": [{"name": "Test Artist"}],
            "year": "2024",
            "type": "Album",
            "thumbnails": [],
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/song/album/vid1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["browseId"] == "album_1"
        assert data["title"] == "Test Album"
        assert data["year"] == "2024"


class TestAlbum:
    """Tests para /album/{browse_id}."""

    def test_album_invalid(self, client):
        """Solicitar álbum inexistente debe devolver estructura vacía."""
        resp = client.get("/album/nonexistent")
        assert resp.status_code == 200
        data = resp.json()
        assert data["tracks"] == []

    @patch("routes.songs.get_ytm")
    def test_album_cache_hit(self, mock_get_ytm, client):
        """Álbum cacheado debe devolverse sin consultar YTMusic."""
        from cache import api_cache_set

        cached = {
            "name": "Cached Album",
            "artists": [{"name": "Cached Artist"}],
            "year": None,
            "type": "Album",
            "thumbnail": None,
            "tracks": [{"videoId": "c1", "title": "Cached Track"}],
        }
        api_cache_set("album:cache_alb", cached)

        resp = client.get("/album/cache_alb")
        assert resp.status_code == 200
        assert resp.json() == cached
        mock_get_ytm.assert_not_called()

    @patch("routes.songs.get_ytm")
    def test_album_with_tracks(self, mock_get_ytm, client):
        """Álbum con tracks debe devolver lista de canciones."""
        mock_ytm = MagicMock()
        mock_ytm.get_album.return_value = {
            "title": "Great Album",
            "artists": [{"name": "Great Artist"}],
            "year": "2024",
            "type": "Album",
            "thumbnails": [],
            "tracks": [
                {
                    "videoId": "track1",
                    "title": "Track 1",
                    "artists": [{"name": "Great Artist"}],
                    "duration_seconds": 200,
                    "trackNumber": 1,
                },
                {
                    "videoId": "track2",
                    "title": "Track 2",
                    "duration": "3:30",
                    "trackNumber": 2,
                },
            ],
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/album/album_1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Great Album"
        assert len(data["tracks"]) == 2
        assert data["tracks"][0]["videoId"] == "track1"
        assert data["tracks"][0]["trackNumber"] == 1


class TestArtist:
    """Tests para /artist/{browse_id}."""

    @patch("routes.songs.get_ytm")
    def test_artist_info(self, mock_get_ytm, client):
        """Información de artista debe incluir nombre y canciones."""
        mock_ytm = MagicMock()
        mock_ytm.get_artist.return_value = {
            "name": "Test Artist",
            "subscribers": "1M",
            "views": "10M",
            "description": "A great artist",
            "thumbnails": [
                {"url": "https://example.com/artist.jpg", "width": 200, "height": 200}
            ],
            "songs": {
                "results": [
                    {
                        "videoId": "song1",
                        "title": "Song 1",
                        "artists": [{"name": "Test Artist"}],
                    }
                ]
            },
            "albums": {"results": []},
            "singles": {"results": []},
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/artist/artist_1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Test Artist"
        assert len(data["songs"]) >= 1
        assert data["songs"][0]["videoId"] == "song1"

    @patch("routes.songs.get_ytm")
    def test_artist_no_thumbnails(self, mock_get_ytm, client):
        """Artista sin thumbnails debe devolver thumbnail vacío."""
        mock_ytm = MagicMock()
        mock_ytm.get_artist.return_value = {
            "name": "No Thumb Artist",
            "thumbnails": [],
            "songs": {"results": []},
            "albums": {"results": []},
            "singles": {"results": []},
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/artist/artist_no_thumb")
        assert resp.status_code == 200
        data = resp.json()
        assert data["thumbnail"] == ""


class TestQueue:
    """Tests para /queue/{video_id}."""

    @patch("routes.songs.get_ytm")
    def test_queue_with_tracks(self, mock_get_ytm, client):
        """Cola debe devolver lista de canciones recomendadas."""
        mock_ytm = MagicMock()
        mock_ytm.get_watch_playlist.return_value = {
            "tracks": [
                {
                    "videoId": "rec1",
                    "title": "Recommended 1",
                    "artists": [{"name": "Artist A"}],
                    "duration_seconds": 180,
                },
                {
                    "videoId": "rec2",
                    "title": "Recommended 2",
                    "artists": [{"name": "Artist B"}],
                    "duration_seconds": 200,
                },
            ]
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/queue/test_vid")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["tracks"]) == 2
        assert data["tracks"][0]["videoId"] == "rec1"

    def test_queue_cache_hit(self, client):
        """Cola cachead debe devolver datos sin llamar a YTMusic."""
        from cache import api_cache_set

        cached_tracks = [
            {
                "videoId": "cached_1",
                "title": "Cached Song",
                "artist": "Cached Artist",
                "duration": 180,
            }
        ]
        api_cache_set("queue:cached_vid", cached_tracks)

        resp = client.get("/queue/cached_vid")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["tracks"]) == 1
        assert data["tracks"][0]["videoId"] == "cached_1"

    @patch("routes.songs.get_ytm")
    def test_queue_empty_tracks(self, mock_get_ytm, client):
        """Cola sin tracks recomendados debe devolver lista vacía."""
        mock_ytm = MagicMock()
        mock_ytm.get_watch_playlist.return_value = {"tracks": []}
        # Sin autor/título, la búsqueda de respaldo se omite y devuelve []
        mock_ytm.get_song.return_value = {"videoDetails": {"author": ""}}
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/queue/empty_vid")
        assert resp.status_code == 200
        data = resp.json()
        assert data["tracks"] == []
        mock_ytm.search.assert_not_called()

    @patch("routes.songs.get_ytm")
    def test_queue_radio_breaks_uses_watch_playlist_fallback(
        self, mock_get_ytm, client
    ):
        """Si la radio (radio=True) falla con KeyError, usar watch playlist normal."""
        mock_ytm = MagicMock()
        # Radio falla como en ytmusicapi 1.7.3 (KeyError 'endpoint')
        mock_ytm.get_watch_playlist.side_effect = [
            KeyError("endpoint"),
            {
                "tracks": [
                    {
                        "videoId": "radio_fail_vid",
                        "title": "Canción actual",
                        "artists": [{"name": "Artist A"}],
                        "duration_seconds": 180,
                    },
                    {
                        "videoId": "wp1",
                        "title": "Watch Playlist 1",
                        "artists": [{"name": "Artist A"}],
                        "duration_seconds": 180,
                    },
                    {
                        "videoId": "wp2",
                        "title": "Watch Playlist 2",
                        "artists": [{"name": "Artist B"}],
                        "duration_seconds": 200,
                    },
                ]
            },
        ]
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/queue/radio_fail_vid")
        assert resp.status_code == 200
        data = resp.json()
        # La canción actual (mismo videoId) debe excluirse del fallback
        assert len(data["tracks"]) == 2
        assert all(t["videoId"] != "radio_fail_vid" for t in data["tracks"])
        assert data["tracks"][0]["videoId"] == "wp1"

    @patch("routes.songs.get_ytm")
    def test_queue_all_playlists_fail_uses_search_fallback(self, mock_get_ytm, client):
        """Si radio y watch playlist fallan, usar búsqueda por artista."""
        mock_ytm = MagicMock()
        mock_ytm.get_watch_playlist.side_effect = Exception("watch playlist broken")
        mock_ytm.get_song.return_value = {
            "videoDetails": {"author": "Fallback Artist", "title": "Some Song"}
        }
        mock_ytm.search.return_value = [
            {
                "videoId": "search1",
                "title": "Search Result 1",
                "artists": [{"name": "Fallback Artist"}],
                "duration_seconds": 190,
            }
        ]
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/queue/total_playlist_fail_vid")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["tracks"]) == 1
        assert data["tracks"][0]["videoId"] == "search1"
        mock_ytm.search.assert_called_once()

    @patch("routes.songs.get_ytm")
    def test_queue_everything_fails_returns_empty_200(self, mock_get_ytm, client):
        """Si todo falla, devolver lista vacía con 200 (nunca 500)."""
        mock_ytm = MagicMock()
        mock_ytm.get_watch_playlist.side_effect = Exception("broken")
        mock_ytm.get_song.side_effect = Exception("get_song broken")
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/queue/total_fail_vid")
        assert resp.status_code == 200
        data = resp.json()
        assert data["tracks"] == []


class TestSongAlbumCache:
    """Tests de caché para /song/album/{video_id}."""

    def test_song_album_cache_hit(self, client):
        """Datos cacheados deben devolverse sin llamar a YTMusic."""
        from cache import api_cache_set

        cached = {"browseId": "cached_album", "title": "Cached Album", "error": None}
        api_cache_set("song_album:cached_vid", cached)

        resp = client.get("/song/album/cached_vid")
        assert resp.status_code == 200
        data = resp.json()
        assert data["browseId"] == "cached_album"


class TestSongAlbumErrors:
    """Tests de errores para /song/album/{video_id}."""

    @patch("routes.songs.get_ytm")
    def test_song_album_get_song_error(self, mock_get_ytm, client):
        """Si get_song lanza excepción, debe devolver error."""
        mock_ytm = MagicMock()
        mock_ytm.get_song.side_effect = Exception("get_song failed")
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/song/album/error_song")
        assert resp.status_code == 200
        data = resp.json()
        assert data["error"] == "get_song_failed"

    @patch("routes.songs.get_ytm")
    def test_song_album_search_exception(self, mock_get_ytm, client):
        """Si search lanza excepción, debe continuar con siguiente query."""
        mock_ytm = MagicMock()
        mock_ytm.get_song.return_value = {
            "videoDetails": {"title": "Some Song", "author": "Some Artist"}
        }
        # First search raises exception, second succeeds
        mock_ytm.search.side_effect = [
            Exception("search error"),
            [
                {
                    "videoId": "vid_srch",
                    "album": {"id": "album_srch", "name": "Album Found"},
                }
            ],
        ]
        mock_ytm.get_album.return_value = {
            "title": "Album Found",
            "artists": [{"name": "Some Artist"}],
            "year": "2024",
            "type": "Album",
            "thumbnails": [],
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/song/album/vid_srch")
        assert resp.status_code == 200
        data = resp.json()
        assert data["browseId"] == "album_srch"

    @patch("routes.songs.get_ytm")
    def test_song_album_get_album_error(self, mock_get_ytm, client):
        """Si get_album lanza excepción, debe devolver respuesta parcial."""
        mock_ytm = MagicMock()
        mock_ytm.get_song.return_value = {
            "videoDetails": {"title": "Album Error Song", "author": "Error Artist"}
        }
        mock_ytm.search.return_value = [
            {
                "videoId": "vid_alb_err",
                "album": {"id": "album_err", "name": "Broken Album"},
            }
        ]
        mock_ytm.get_album.side_effect = Exception("get_album failed")
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/song/album/vid_alb_err")
        assert resp.status_code == 200
        data = resp.json()
        assert data["browseId"] == "album_err"
        assert data["title"] == "Broken Album"
        assert data["thumbnail"] == ""

    @patch("routes.songs.get_ytm")
    def test_song_album_second_query(self, mock_get_ytm, client):
        """Primera búsqueda sin resultado, segunda encuentra el álbum."""
        mock_ytm = MagicMock()
        mock_ytm.get_song.return_value = {
            "videoDetails": {"title": "Only Title", "author": "Only Author"}
        }
        # First search returns results but no videoId match
        # Second search (with title + author) finds it
        mock_ytm.search.side_effect = [
            [{"videoId": "other_vid", "album": {"id": "other_album"}}],
            [
                {
                    "videoId": "vid_2q",
                    "album": {"id": "album_2q", "name": "Second Query Album"},
                }
            ],
        ]
        mock_ytm.get_album.return_value = {
            "title": "Second Query Album",
            "artists": [{"name": "Only Author"}],
            "year": "2024",
            "type": "Album",
            "thumbnails": [],
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/song/album/vid_2q")
        assert resp.status_code == 200
        data = resp.json()
        assert data["browseId"] == "album_2q"

    @patch("routes.songs.get_ytm")
    def test_song_album_empty_title_continue(self, mock_get_ytm, client):
        """Título vacío debe saltar el primer query (continue) y usar el segundo."""
        mock_ytm = MagicMock()
        mock_ytm.get_song.return_value = {
            "videoDetails": {"title": "", "author": "Some Artist"}
        }
        # First query "" → query.strip() is falsy → continue
        # Second query " Some Artist" → search runs
        mock_ytm.search.return_value = [
            {"videoId": "empty_t", "album": {"id": "album_et", "name": "Found Album"}}
        ]
        mock_ytm.get_album.return_value = {
            "title": "Found Album",
            "artists": [{"name": "Some Artist"}],
            "year": "2024",
            "type": "Album",
            "thumbnails": [],
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/song/album/empty_t")
        assert resp.status_code == 200
        data = resp.json()
        assert data["browseId"] == "album_et"


class TestAlbumEdgeCases:
    """Tests de casos borde para /album/{browse_id}."""

    @patch("routes.songs.get_ytm")
    def test_album_track_without_videoid(self, mock_get_ytm, client):
        """Track sin videoId debe omitirse."""
        mock_ytm = MagicMock()
        mock_ytm.get_album.return_value = {
            "title": "Album",
            "artists": [{"name": "Artist"}],
            "year": "2024",
            "type": "Album",
            "thumbnails": [],
            "tracks": [
                {"videoId": "", "title": "Skip Me"},  # no videoId → skipped
                {
                    "videoId": "track_ok",
                    "title": "Keep Me",
                    "artists": [{"name": "Artist"}],
                    "duration_seconds": 180,
                    "trackNumber": 1,
                },
            ],
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/album/album_skip")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["tracks"]) == 1
        assert data["tracks"][0]["videoId"] == "track_ok"

    @patch("routes.songs.get_ytm")
    def test_album_artist_fallback(self, mock_get_ytm, client):
        """Track sin artista válido debe usar artista del álbum."""
        mock_ytm = MagicMock()
        mock_ytm.get_album.return_value = {
            "title": "Album",
            "artists": [{"name": "Album Artist"}],
            "year": "2024",
            "type": "Album",
            "thumbnails": [],
            "tracks": [
                {
                    "videoId": "track_fb",
                    "title": "Track",
                    "artists": [{"name": ""}],  # empty name → cleaned to empty
                    "duration_seconds": 200,
                    "trackNumber": 1,
                }
            ],
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/album/album_fb")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["tracks"]) == 1
        # Artist should fall back to album artist
        assert data["tracks"][0]["artist"] == "Album Artist"


class TestArtistCache:
    """Tests de caché para /artist/{browse_id}."""

    def test_artist_cache_hit(self, client):
        """Datos cacheados de artista deben devolverse sin llamar a YTMusic."""
        from cache import api_cache_set

        cached = {
            "browseId": "cached_artist",
            "name": "Cached Artist",
            "songs": [],
            "albums": [],
            "singles": [],
        }
        api_cache_set("artist:cached_artist", cached)

        resp = client.get("/artist/cached_artist")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Cached Artist"


class TestArtistEdgeCases:
    """Tests de casos borde para /artist/{browse_id}."""

    @patch("routes.songs.get_ytm")
    def test_artist_google_thumbnail(self, mock_get_ytm, client):
        """Thumbnail de googleusercontent debe transformarse a w576-h576."""
        mock_ytm = MagicMock()
        mock_ytm.get_artist.return_value = {
            "name": "G Artist",
            "thumbnails": [
                {
                    "url": "https://lh3.googleusercontent.com/abc123=w200-h200",
                    "width": 200,
                    "height": 200,
                }
            ],
            "songs": {"results": []},
            "albums": {"results": []},
            "singles": {"results": []},
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/artist/google_artist")
        assert resp.status_code == 200
        data = resp.json()
        assert "=w576-h576-l90-rj" in data["thumbnail"]
        assert data["thumbnail"].startswith("https://lh3.googleusercontent.com/abc123")

    @patch("routes.songs.get_ytm")
    def test_artist_with_albums_and_singles(self, mock_get_ytm, client):
        """Artista con álbumes y singles debe formatearlos con _fmt_album."""
        mock_ytm = MagicMock()
        mock_ytm.get_artist.return_value = {
            "name": "Full Artist",
            "thumbnails": [],
            "songs": {"results": []},
            "albums": {
                "results": [
                    {
                        "browseId": "album_1",
                        "title": "First Album",
                        "year": "2023",
                        "type": "Album",
                        "thumbnails": [
                            {
                                "url": "https://example.com/alb1.jpg",
                                "width": 100,
                                "height": 100,
                            }
                        ],
                    }
                ]
            },
            "singles": {
                "results": [
                    {
                        "browseId": "single_1",
                        "title": "First Single",
                        "year": "2024",
                        "type": "Single",
                        "thumbnails": [],
                    }
                ]
            },
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/artist/full_artist")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["albums"]) == 1
        assert data["albums"][0]["browseId"] == "album_1"
        assert data["albums"][0]["title"] == "First Album"
        assert data["albums"][0]["thumbnail"] != ""
        assert len(data["singles"]) == 1
        assert data["singles"][0]["browseId"] == "single_1"
        assert data["singles"][0]["title"] == "First Single"
        assert data["singles"][0]["thumbnail"] == ""


class TestSongDetailsCache:
    """Tests de caché para /song/details/{video_id}."""

    def test_song_details_cache_hit(self, client):
        """Detalles cacheados deben devolverse sin llamar a YTMusic."""
        from cache import api_cache_set

        cached = {"videoId": "cached_detail", "title": "Cached Detail"}
        api_cache_set("details:cached_detail", cached)

        resp = client.get("/song/details/cached_detail")
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Cached Detail"


class TestFeedbackEndpoint:
    """Tests para POST /queue/feedback — entrenar recomendaciones."""

    def test_record_skip(self, client):
        """Registrar skip debe devolver ok."""
        resp = client.post(
            "/queue/feedback",
            json={
                "videoId": "skip_vid_1",
                "action": "skip",
                "artist": "Artist A",
                "title": "Skip Song",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True

    def test_record_complete(self, client):
        """Registrar complete debe devolver ok."""
        resp = client.post(
            "/queue/feedback",
            json={
                "videoId": "complete_vid_1",
                "action": "complete",
                "artist": "Artist B",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True

    def test_record_like(self, client):
        """Registrar like debe devolver ok (no falla aunque rate_song no tenga auth)."""
        resp = client.post(
            "/queue/feedback",
            json={
                "videoId": "like_vid_1",
                "action": "like",
                "artist": "Artist C",
                "title": "Like Song",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True

    def test_record_unlike(self, client):
        """Registrar unlike debe devolver ok."""
        resp = client.post(
            "/queue/feedback",
            json={
                "videoId": "unlike_vid_1",
                "action": "unlike",
                "artist": "Artist D",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True

    def test_feedback_minimal_body(self, client):
        """Solo videoId y action son obligatorios; los defaults deben funcionar."""
        resp = client.post(
            "/queue/feedback",
            json={"videoId": "minimal_vid", "action": "skip"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True

    def test_feedback_invalid_action(self, client):
        """Cualquier string en action es aceptado (no hay validación estricta)."""
        resp = client.post(
            "/queue/feedback",
            json={"videoId": "invalid_act", "action": "unknown_action"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True


class TestQueueWithArtist:
    """Tests para /queue/{video_id} con parámetro artist y feedback."""

    @patch("routes.songs.get_ytm")
    def test_queue_with_matching_artist(self, mock_get_ytm, client):
        """Con artist param, tracks del mismo artista deben ir primero."""
        mock_ytm = MagicMock()
        mock_ytm.get_watch_playlist.return_value = {
            "tracks": [
                {
                    "videoId": "diff_1",
                    "title": "Different Artist Song",
                    "artists": [{"name": "Other Artist"}],
                    "duration_seconds": 180,
                },
                {
                    "videoId": "match_1",
                    "title": "Same Artist Song",
                    "artists": [{"name": "My Artist"}],
                    "duration_seconds": 200,
                },
                {
                    "videoId": "diff_2",
                    "title": "Another Different",
                    "artists": [{"name": "Yet Another"}],
                    "duration_seconds": 190,
                },
                {
                    "videoId": "match_2",
                    "title": "Same Artist 2",
                    "artists": [{"name": "My Artist"}],
                    "duration_seconds": 210,
                },
            ]
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/queue/test_vid?artist=My+Artist&limit=10")
        assert resp.status_code == 200
        data = resp.json()
        tracks = data["tracks"]
        # Los tracks de "My Artist" deben ir primero
        assert len(tracks) == 4
        # Primeros dos deben ser los que coinciden con "My Artist"
        assert tracks[0]["videoId"] == "match_1"
        assert tracks[1]["videoId"] == "match_2"
        # Luego los diferentes
        assert tracks[2]["videoId"] == "diff_1"
        assert tracks[3]["videoId"] == "diff_2"

    @patch("routes.songs.get_ytm")
    def test_queue_without_artist_param(self, mock_get_ytm, client):
        """Sin artist param, orden original debe mantenerse."""
        mock_ytm = MagicMock()
        mock_ytm.get_watch_playlist.return_value = {
            "tracks": [
                {
                    "videoId": "a1",
                    "title": "A",
                    "artists": [{"name": "Artist A"}],
                    "duration_seconds": 180,
                },
                {
                    "videoId": "b1",
                    "title": "B",
                    "artists": [{"name": "Artist B"}],
                    "duration_seconds": 200,
                },
            ]
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/queue/test_no_artist")
        assert resp.status_code == 200
        data = resp.json()
        tracks = data["tracks"]
        assert len(tracks) == 2
        assert tracks[0]["videoId"] == "a1"
        assert tracks[1]["videoId"] == "b1"

    @patch("routes.songs.get_ytm")
    def test_queue_artist_param_cache_hit(self, mock_get_ytm, client):
        """Con cache hit, reordenar por artista debe funcionar igual."""
        from cache import api_cache_set

        cached_tracks = [
            {
                "videoId": "c1",
                "title": "Other",
                "artist": "Different Artist",
                "duration": 180,
            },
            {"videoId": "c2", "title": "Match", "artist": "My Artist", "duration": 200},
        ]
        api_cache_set("queue:cached_artist_vid", cached_tracks)

        resp = client.get("/queue/cached_artist_vid?artist=My+Artist")
        assert resp.status_code == 200
        data = resp.json()
        tracks = data["tracks"]
        assert len(tracks) == 2
        # Match debe ir primero
        assert tracks[0]["videoId"] == "c2"
        assert tracks[1]["videoId"] == "c1"
        # No debe llamar a YTMusic
        mock_get_ytm.assert_not_called()


class TestFeedbackIntegration:
    """Tests de integración: feedback afecta reordenamiento en /queue."""

    def _insert_feedback(self, client, video_id, action, artist):
        """Helper para insertar feedback vía API."""
        resp = client.post(
            "/queue/feedback",
            json={"videoId": video_id, "action": action, "artist": artist},
        )
        assert resp.status_code == 200

    @patch("routes.songs.get_ytm")
    def test_skipped_artist_goes_last(self, mock_get_ytm, client):
        """Artista que se salta siempre debe ir al final del grupo 'otros'."""
        # Primero: registrar feedback: "Skippy Artist" siempre se salta
        self._insert_feedback(client, "skip_1", "skip", "Skippy Artist")
        self._insert_feedback(client, "skip_2", "skip", "Skippy Artist")
        self._insert_feedback(client, "skip_3", "skip", "Skippy Artist")
        # "Good Artist" siempre se completa
        self._insert_feedback(client, "good_1", "complete", "Good Artist")
        self._insert_feedback(client, "good_2", "complete", "Good Artist")

        mock_ytm = MagicMock()
        mock_ytm.get_watch_playlist.return_value = {
            "tracks": [
                {
                    "videoId": "good_track",
                    "title": "Good Song",
                    "artists": [{"name": "Good Artist"}],
                    "duration_seconds": 180,
                },
                {
                    "videoId": "skippy_track",
                    "title": "Skip Song",
                    "artists": [{"name": "Skippy Artist"}],
                    "duration_seconds": 200,
                },
                {
                    "videoId": "current_track",
                    "title": "Current Song",
                    "artists": [{"name": "Current Artist"}],
                    "duration_seconds": 190,
                },
            ]
        }
        mock_get_ytm.return_value = mock_ytm

        # Current artist es "Current Artist" → "Good Artist" y "Skippy Artist"
        # son "otros", y "Good Artist" debe ir antes que "Skippy Artist"
        resp = client.get("/queue/test_fb_vid?artist=Current+Artist&limit=10")
        assert resp.status_code == 200
        data = resp.json()
        tracks = data["tracks"]
        assert len(tracks) == 3
        # Current Artist match go first (the one with artist match)
        # Actually none match "Current Artist" directly... let me check
        # The track "current_track" has artist "Current Artist" so it should be in matches
        # Wait, all tracks have different artists. Only "current_track" matches "Current Artist"
        assert tracks[0]["videoId"] == "current_track"
        # Then "Good Artist" (0 skips) should come before "Skippy Artist" (all skips)
        good_idx = next(i for i, t in enumerate(tracks) if t["videoId"] == "good_track")
        skippy_idx = next(
            i for i, t in enumerate(tracks) if t["videoId"] == "skippy_track"
        )
        assert good_idx < skippy_idx, (
            f"Good Artist (idx {good_idx}) should come before Skippy Artist (idx {skippy_idx})"
        )

    @patch("routes.songs.get_ytm")
    def test_feedback_does_not_break_queue(self, mock_get_ytm, client):
        """Feedback sin datos relevantes no debe alterar orden."""
        # Insertar feedback para artista que NO aparece en los resultados
        self._insert_feedback(client, "unrel_1", "skip", "Unrelated Artist")

        mock_ytm = MagicMock()
        mock_ytm.get_watch_playlist.return_value = {
            "tracks": [
                {
                    "videoId": "t1",
                    "title": "Track 1",
                    "artists": [{"name": "Artist X"}],
                    "duration_seconds": 180,
                },
                {
                    "videoId": "t2",
                    "title": "Track 2",
                    "artists": [{"name": "Artist Y"}],
                    "duration_seconds": 200,
                },
            ]
        }
        mock_get_ytm.return_value = mock_ytm

        resp = client.get("/queue/test_noeffect_vid?artist=My+Artist&limit=10")
        assert resp.status_code == 200
        data = resp.json()
        tracks = data["tracks"]
        assert len(tracks) == 2
        # Ambos son "otros", y tienen score neutral (0.5), orden original preservado
        assert tracks[0]["videoId"] == "t1"
        assert tracks[1]["videoId"] == "t2"
