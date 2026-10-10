"""Tests para backend/utils.py."""

from unittest.mock import MagicMock

from utils import (
    _pick_chart_playlist,
    best_thumb,
    clean_artist_name,
    extract_chart_items,
    fmt_num,
    fmt_song,
    fmt_thumbs,
    parse_duration,
    upgrade_goog_url,
)

# ── parse_duration ────────────────────────────────────────────────────────────────


class TestParseDuration:
    def test_none(self):
        assert parse_duration(None) == 0

    def test_empty_string(self):
        assert parse_duration("") == 0

    def test_integer(self):
        assert parse_duration(180) == 180

    def test_mm_ss(self):
        assert parse_duration("3:45") == 225

    def test_hh_mm_ss(self):
        assert parse_duration("1:15:30") == 4530

    def test_invalid_format(self):
        assert parse_duration("abc") == 0


# ── clean_artist_name ─────────────────────────────────────────────────────────────


class TestCleanArtistName:
    def test_none(self):
        assert clean_artist_name("") is False

    def test_real_artist(self):
        assert clean_artist_name("Muse") is True

    def test_real_artist_two_words(self):
        assert clean_artist_name("Gustavo Cerati") is True

    def test_play_count_english(self):
        assert clean_artist_name("1.2M plays") is False

    def test_play_count_spanish(self):
        assert clean_artist_name("500K reproducciones") is False

    def test_number_only(self):
        assert clean_artist_name("12345") is False

    def test_number_with_k(self):
        assert clean_artist_name("12.5K") is False


# ── fmt_num ───────────────────────────────────────────────────────────────────────


class TestFmtNum:
    def test_none(self):
        assert fmt_num(None) == ""

    def test_empty(self):
        assert fmt_num("") == ""

    def test_thousands(self):
        assert fmt_num("1500") == "1.5K"

    def test_millions(self):
        assert fmt_num("2500000") == "2.5M"

    def test_billions(self):
        assert fmt_num("1500000000") == "1.5B"

    def test_small_number(self):
        assert fmt_num("42") == "42"

    def test_with_commas(self):
        assert fmt_num("1,234,567") == "1.2M"


# ── upgrade_goog_url ──────────────────────────────────────────────────────────────


class TestUpgradeGoogUrl:
    def test_non_google_url(self):
        url = "https://example.com/image.jpg"
        assert upgrade_goog_url(url) == url

    def test_empty_url(self):
        assert upgrade_goog_url("") == ""

    def test_upgrade_quality(self):
        url = "https://lh3.googleusercontent.com/abc=h120"
        result = upgrade_goog_url(url, px=576)
        assert "=w576-h576-l90-rj" in result
        assert "h120" not in result

    def test_default_px(self):
        url = "https://lh3.googleusercontent.com/abc=h120"
        result = upgrade_goog_url(url)
        assert "=w1200-h1200-l90-rj" in result


# ── best_thumb ────────────────────────────────────────────────────────────────────


class TestBestThumb:
    def test_empty(self):
        assert best_thumb([]) == ""

    def test_single_thumb(self):
        thumbs = [{"url": "https://example.com/img.jpg", "width": 100, "height": 100}]
        result = best_thumb(thumbs)
        assert result == "https://example.com/img.jpg"

    def test_picks_largest(self):
        thumbs = [
            {"url": "https://example.com/small.jpg", "width": 100, "height": 100},
            {"url": "https://example.com/large.jpg", "width": 500, "height": 500},
        ]
        result = best_thumb(thumbs)
        assert "large" in result

    def test_prefers_google(self):
        thumbs = [
            {"url": "https://example.com/other.jpg", "width": 500, "height": 500},
            {
                "url": "https://lh3.googleusercontent.com/abc=h120",
                "width": 200,
                "height": 200,
            },
        ]
        result = best_thumb(thumbs)
        assert "googleusercontent" in result


# ── fmt_thumbs ────────────────────────────────────────────────────────────────────


class TestFmtThumbs:
    def test_empty(self):
        assert fmt_thumbs([]) == []

    def test_google_thumbnails(self):
        thumbs = [
            {
                "url": "https://lh3.googleusercontent.com/abc=h120",
                "width": 120,
                "height": 120,
            }
        ]
        result = fmt_thumbs(thumbs)
        assert len(result) == 5  # 120, 226, 576, 1200, 2048
        assert result[-1]["width"] == 2048
        assert result[0]["width"] == 120

    def test_ytimg_generates_hd(self):
        """ytimg con videoId debe generar los 4 formatos estándar de YouTube."""
        thumbs = [
            {
                "url": "https://i.ytimg.com/vi/test123/hqdefault.jpg",
                "width": 480,
                "height": 360,
            }
        ]
        result = fmt_thumbs(thumbs)
        assert len(result) == 4
        # maxresdefault debe ser el primero (1280x720)
        assert result[0]["width"] == 1280
        assert "maxresdefault" in result[0]["url"]
        assert "test123" in result[0]["url"]
        # mqdefault debe ser el último (320x180)
        assert result[-1]["width"] == 320
        assert "mqdefault" in result[-1]["url"]

    def test_ytimg_no_videoid_fallback(self):
        """ytimg sin videoId recognizable debe pasar los originales."""
        thumbs = [
            {
                "url": "https://i.ytimg.com/test/mqdefault.jpg",
                "width": 320,
                "height": 180,
            }
        ]
        result = fmt_thumbs(thumbs)
        assert len(result) == 1
        assert result[0]["width"] == 320

    def test_ytimg_thumbnails(self):
        thumbs = [
            {
                "url": "https://i.ytimg.com/vi/test/mqdefault.jpg",
                "width": 320,
                "height": 180,
            },
            {
                "url": "https://i.ytimg.com/vi/test/hqdefault.jpg",
                "width": 480,
                "height": 360,
            },
        ]
        result = fmt_thumbs(thumbs)
        # Ahora genera 4 formatos HD desde el videoId
        assert len(result) == 4
        assert result[0]["width"] == 1280  # maxresdefault
        assert result[-1]["width"] == 320  # mqdefault

    def test_skips_duplicates(self):
        thumbs = [
            {
                "url": "https://i.ytimg.com/vi/test/mqdefault.jpg",
                "width": 320,
                "height": 180,
            },
            {
                "url": "https://i.ytimg.com/vi/test/mqdefault.jpg",
                "width": 320,
                "height": 180,
            },
        ]
        result = fmt_thumbs(thumbs)
        # Ahora genera 4 formatos HD desde el videoId, ignora duplicados
        assert len(result) == 4

    def test_unknown_source(self):
        thumbs = [{"url": "https://example.com/img.jpg", "width": 100, "height": 100}]
        assert fmt_thumbs(thumbs) == []


# ── fmt_song ──────────────────────────────────────────────────────────────────────


class TestFmtSong:
    def test_minimal_song(self):
        r = {"videoId": "abc123", "title": "Test"}
        result = fmt_song(r)
        assert result["videoId"] == "abc123"
        assert result["title"] == "Test"
        assert result["artist"] == "Desconocido"
        assert result["duration"] == 0

    def test_full_song(self):
        r = {
            "videoId": "xyz789",
            "title": "Mi Canción",
            "artists": [{"name": "Mi Artista", "id": "artist_001"}],
            "duration_seconds": 200,
            "album": {"name": "Mi Álbum", "id": "album_001"},
        }
        result = fmt_song(r)
        assert result["videoId"] == "xyz789"
        assert result["title"] == "Mi Canción"
        assert result["artist"] == "Mi Artista"
        assert result["album"] == "Mi Álbum"
        assert result["duration"] == 200

    def test_artist_as_string(self):
        r = {"videoId": "1", "title": "T", "artists": "Solo Artist"}
        result = fmt_song(r)
        assert result["artist"] == "Solo Artist"

    def test_string_artist_play_count(self):
        """Los play counts como string deben filtrarse."""
        r = {"videoId": "1", "title": "T", "artists": "1.2M plays"}
        result = fmt_song(r)
        assert result["artist"] == "Desconocido"


# ── extract_chart_items (trending) ─────────────────────────────────────────────


class TestExtractChartItems:
    """Formas de get_charts(): dict legado (canciones inline) y ytmusicapi
    >= 1.12 (playlists de gráfico → get_playlist)."""

    def test_legacy_songs_dict(self):
        charts = {
            "songs": {
                "items": [
                    {
                        "videoId": "l1",
                        "title": "Legacy",
                        "artists": [{"name": "A"}],
                        "duration_seconds": 100,
                        "thumbnails": [],
                    }
                ]
            }
        }
        out = extract_chart_items(charts, limit=10)
        assert [s["videoId"] for s in out] == ["l1"]
        assert out[0]["artist"] == "A"

    def test_playlist_shape_uses_get_playlist(self):
        """ytmusicapi >= 1.12: elige la playlist «Trending» y trae sus temas."""
        ytm = MagicMock()
        ytm.get_playlist.return_value = {
            "tracks": [
                {
                    "videoId": "pl1",
                    "title": "Trend 1",
                    "artists": [{"name": "TA"}],
                    "duration_seconds": 120,
                    "thumbnails": [],
                },
                {
                    "videoId": "pl2",
                    "title": "Trend 2",
                    "artists": [{"name": "TB"}],
                    "duration_seconds": 130,
                    "thumbnails": [],
                },
            ]
        }
        charts = {
            "countries": {"selected": "US", "options": []},
            "videos": [
                {"title": "Top 100 Live Performances - US", "playlistId": "PLlive"},
                {"title": "Trending 20 United States", "playlistId": "PLtrend"},
                {"title": "Daily Top Music Videos - US", "playlistId": "PLdaily"},
            ],
            "artists": [{"title": "Drake", "browseId": "UCx"}],
        }
        out = extract_chart_items(charts, limit=25, ytm=ytm)
        ytm.get_playlist.assert_called_once_with("PLtrend", limit=25)
        assert [s["videoId"] for s in out] == ["pl1", "pl2"]
        assert out[0]["artist"] == "TA"

    def test_playlist_shape_without_ytm_is_empty(self):
        charts = {"videos": [{"title": "Trending 20", "playlistId": "PLt"}]}
        assert extract_chart_items(charts) == []

    def test_pick_playlist_prefers_trending_then_daily(self):
        charts = {
            "videos": [
                {"title": "Top 100", "playlistId": "PLtop"},
                {"title": "Daily Top Music Videos", "playlistId": "PLdaily"},
                {"title": "Trending 20", "playlistId": "PLtrend"},
            ]
        }
        assert _pick_chart_playlist(charts) == "PLtrend"
        del charts["videos"][2]
        assert _pick_chart_playlist(charts) == "PLdaily"

    def test_empty_charts(self):
        assert extract_chart_items({}) == []
        assert extract_chart_items(None) == []


# ── Assets locales (offline): downloaded / coverLocal ──────────────────────────


class TestLocalAssets:
    """cover_local_url / enrich_local_flags / fmt_song con assets en disco."""

    def test_cover_local_url_and_enrich(self):
        import config as cfg

        from utils import cover_local_url, enrich_local_flags

        (cfg.MUSIC_DIR / "vid_assets_c1.mp3").write_bytes(b"mp3")
        (cfg.COVERS_DIR / "vid_assets_c1.jpg").write_bytes(b"jpg")
        try:
            assert cover_local_url("vid_assets_c1") == "/music/covers/vid_assets_c1.jpg"
            assert cover_local_url("vid_assets_missing") == ""
            assert cover_local_url("../evil") == ""

            items = [
                {"videoId": "vid_assets_c1"},
                {"videoId": "vid_assets_missing"},
                {"title": "sin id"},
            ]
            enrich_local_flags(items)
            assert items[0]["downloaded"] is True
            assert items[0]["coverLocal"] == "/music/covers/vid_assets_c1.jpg"
            assert items[1]["downloaded"] is False
            assert items[1]["coverLocal"] == ""
            assert "downloaded" not in items[2]
        finally:
            (cfg.MUSIC_DIR / "vid_assets_c1.mp3").unlink(missing_ok=True)
            (cfg.COVERS_DIR / "vid_assets_c1.jpg").unlink(missing_ok=True)

    def test_fmt_song_marks_local_assets(self):
        import config as cfg

        (cfg.MUSIC_DIR / "vid_assets_fmt.mp3").write_bytes(b"mp3")
        (cfg.COVERS_DIR / "vid_assets_fmt.jpg").write_bytes(b"jpg")
        try:
            song = fmt_song(
                {"videoId": "vid_assets_fmt", "title": "T", "artists": [{"name": "A"}]}
            )
            assert song["downloaded"] is True
            assert song["coverLocal"] == "/music/covers/vid_assets_fmt.jpg"
        finally:
            (cfg.MUSIC_DIR / "vid_assets_fmt.mp3").unlink(missing_ok=True)
            (cfg.COVERS_DIR / "vid_assets_fmt.jpg").unlink(missing_ok=True)

    def test_fmt_song_without_assets(self):
        song = fmt_song(
            {"videoId": "vid_assets_none", "title": "T", "artists": [{"name": "A"}]}
        )
        assert song["downloaded"] is False
        assert song["coverLocal"] == ""
