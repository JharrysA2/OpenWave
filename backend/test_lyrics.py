"""Tests for backend/lyrics.py — Obtención de letras desde múltiples fuentes."""

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from lyrics import get_local_lyrics, get_lyrics, search_lyrics


class TestGetLocalLyrics:
    """Tests para get_local_lyrics() — función async."""

    @pytest.mark.asyncio
    @patch("lyrics.LYRICS_DIR")
    async def test_local_lyrics_found(self, mock_lyrics_dir):
        """Si el archivo .lrc existe, debe devolver sus líneas."""
        mock_path = MagicMock(spec=Path)
        mock_path.exists.return_value = True
        mock_path.read_text.return_value = "line1\nline2\n"
        mock_lyrics_dir.__truediv__.return_value = mock_path

        result = await get_local_lyrics("known_vid")
        assert result["lyrics"] is not None
        assert result["lyrics"] == ["line1", "line2"]

    @pytest.mark.asyncio
    @patch("lyrics.LYRICS_DIR")
    async def test_local_lyrics_not_found(self, mock_lyrics_dir):
        """Si el archivo .lrc no existe, debe devolver lyrics: None."""
        mock_path = MagicMock(spec=Path)
        mock_path.exists.return_value = False
        mock_lyrics_dir.__truediv__.return_value = mock_path

        result = await get_local_lyrics("unknown_vid")
        assert result["lyrics"] is None


class TestSearchLyrics:
    """Tests para search_lyrics() con mocking de httpx y ytmusic."""

    @pytest.mark.asyncio
    async def test_lrclib_source_success(self):
        """Búsqueda en LRCLib debe devolver resultados estructurados."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {
                "trackName": "Test Song",
                "artistName": "Test Artist",
                "duration": 200,
                "syncedLyrics": "[00:01] Hello",
                "plainLyrics": "",
            }
        ]

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response

        with patch("httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__.return_value = mock_client
            result = await search_lyrics(
                title="Test Song", artist="Test Artist", source="lrclib"
            )

        assert result["source"] == "lrclib"
        assert len(result["results"]) == 1
        assert result["results"][0]["source"] == "LRCLib"
        assert result["results"][0]["text"] == "[00:01] Hello"

    @pytest.mark.asyncio
    async def test_lrclib_empty_response(self):
        """Búsqueda en LRCLib sin resultados debe devolver lista vacía."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = []

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response

        with patch("httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__.return_value = mock_client
            result = await search_lyrics(title="Unknown", source="lrclib")

        assert len(result["results"]) == 0

    @pytest.mark.asyncio
    async def test_lrclib_http_error(self):
        """Error HTTP en LRCLib debe manejarse sin lanzar excepción."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.raise_for_status.side_effect = Exception("HTTP 500")

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response

        with patch("httpx.AsyncClient") as mock_cls:
            mock_cls.return_value.__aenter__.return_value = mock_client
            result = await search_lyrics(title="Test", source="lrclib")

        assert len(result["results"]) == 0

    @pytest.mark.asyncio
    async def test_ytmusic_source_success(self):
        """Búsqueda en YTMusic debe devolver resultados."""
        mock_ytm = MagicMock()
        mock_ytm.search.return_value = [{"videoId": "vid1", "title": "Found Song"}]
        mock_ytm.get_watch_playlist.return_value = {"lyrics": "lyrics_id"}
        mock_ytm.get_lyrics.return_value = {"lyrics": "Line 1\nLine 2\n"}

        with (
            patch("lyrics.get_ytm", return_value=mock_ytm),
            patch("lyrics.fmt_song", return_value={"artist": "Artist"}),
        ):
            result = await search_lyrics(source="ytmusic")

        assert result["source"] == "ytmusic"
        assert len(result["results"]) >= 1

    @pytest.mark.asyncio
    async def test_ytmusic_no_lyrics_id(self):
        """Si YTMusic no encuentra lyrics_id, debe devolver lista vacía."""
        mock_ytm = MagicMock()
        mock_ytm.search.return_value = [{"videoId": "vid1"}]
        mock_ytm.get_watch_playlist.return_value = {}

        with patch("lyrics.get_ytm", return_value=mock_ytm):
            result = await search_lyrics(source="ytmusic")

        assert len(result["results"]) == 0

    @pytest.mark.asyncio
    async def test_genius_source_no_token(self):
        """Genius sin token debe devolver lista vacía (error controlado)."""
        with patch.dict("os.environ", {}, clear=True):
            result = await search_lyrics(title="Test", source="genius")

        assert len(result["results"]) == 0

    @pytest.mark.asyncio
    async def test_musixmatch_source(self):
        """Musixmatch debe devolver un resultado con __NO_KEY__."""
        result = await search_lyrics(source="musixmatch")
        assert len(result["results"]) == 1
        assert result["results"][0]["text"] == "__NO_KEY__"


class TestGetLyrics:
    """Tests para get_lyrics() — flujo completo con caché."""

    @pytest.mark.asyncio
    async def test_cache_hit_returns_cached(self):
        """Si hay caché, debe devolverlo sin llamar a APIs."""
        with patch("lyrics.api_cache_get", return_value=["line1", "line2"]):
            result = await get_lyrics("cached_vid")
            assert result["lyrics"] == ["line1", "line2"]

    @pytest.mark.asyncio
    async def test_lrclib_exact_match(self):
        """LRCLib exact match debe devolver letras."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "syncedLyrics": "[00:01] Hello world",
            "plainLyrics": "",
        }

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response

        with (
            patch("lyrics.api_cache_get", return_value=None),
            patch("httpx.AsyncClient") as mock_cls,
        ):
            mock_cls.return_value.__aenter__.return_value = mock_client
            result = await get_lyrics("exact_vid", title="Hello", artist="World")

        assert result["lyrics"] == ["[00:01] Hello world"]
        assert result["source"] == "lrclib"

    @pytest.mark.asyncio
    async def test_lrclib_exact_not_found_falls_back_to_search(self):
        """Si exact match falla, debe buscar en LRCLib."""
        exact_resp = MagicMock()
        exact_resp.status_code = 404

        search_resp = MagicMock()
        search_resp.status_code = 200
        search_resp.json.return_value = [
            {"syncedLyrics": "[00:01] Found via search", "plainLyrics": ""}
        ]

        mock_client = AsyncMock()
        mock_client.get.side_effect = [exact_resp, search_resp]

        with (
            patch("lyrics.api_cache_get", return_value=None),
            patch("httpx.AsyncClient") as mock_cls,
        ):
            mock_cls.return_value.__aenter__.return_value = mock_client
            result = await get_lyrics("search_vid", title="Unknown", artist="Unknown")

        assert result["lyrics"] == ["[00:01] Found via search"]
        assert mock_client.get.call_count >= 2

    @pytest.mark.asyncio
    async def test_all_sources_fail_returns_none(self):
        """Si todas las fuentes fallan, debe devolver lyrics: None."""
        failed_resp = MagicMock()
        failed_resp.status_code = 500
        failed_resp.raise_for_status.side_effect = Exception("HTTP error")

        mock_client = AsyncMock()
        mock_client.get.return_value = failed_resp

        mock_ytm = MagicMock()
        mock_ytm.get_watch_playlist.return_value = {}

        with (
            patch("lyrics.api_cache_get", return_value=None),
            patch("httpx.AsyncClient") as mock_cls,
            patch("lyrics.get_ytm", return_value=mock_ytm),
        ):
            mock_cls.return_value.__aenter__.return_value = mock_client
            result = await get_lyrics("no_result_vid", title="Nope")

        assert result["lyrics"] is None

    @pytest.mark.asyncio
    async def test_ytmusic_fallback(self):
        """Cuando LRCLib falla, debe intentar YTMusic."""
        failed_resp = MagicMock()
        failed_resp.status_code = 500
        failed_resp.raise_for_status.side_effect = Exception("HTTP error")

        mock_client = AsyncMock()
        mock_client.get.return_value = failed_resp

        mock_ytm = MagicMock()
        wp = {"lyrics": "yt_lyrics_id", "tracks": []}
        mock_ytm.get_watch_playlist.return_value = wp
        mock_ytm.get_lyrics.return_value = {"lyrics": "YT Line 1\nYT Line 2\n"}

        with (
            patch("lyrics.api_cache_get", return_value=None),
            patch("httpx.AsyncClient") as mock_cls,
            patch("lyrics.get_ytm", return_value=mock_ytm),
        ):
            mock_cls.return_value.__aenter__.return_value = mock_client
            result = await get_lyrics("yt_fallback_vid", title="Test")

        assert result["lyrics"] == ["YT Line 1", "YT Line 2"]
        assert result["source"] == "ytmusic"
