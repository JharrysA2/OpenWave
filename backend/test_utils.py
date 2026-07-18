"""Tests para backend/utils.py."""

from utils import (
    best_thumb,
    clean_artist_name,
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
