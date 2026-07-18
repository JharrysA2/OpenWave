"""Tests for backend/streaming.py — Extracción de URLs de audio."""

import threading
from unittest.mock import patch

import pytest
from streaming import _extract_audio_url_sync, prefetch


class TestExtractAudioUrlSync:
    """Tests para _extract_audio_url_sync con mocking de yt-dlp y caché."""

    @patch(
        "streaming.get_cached_url",
        return_value=("https://cached.url/audio", {"UA": "test"}),
    )
    def test_cache_hit_returns_cached(self, mock_get_cached):
        """Si la URL está en caché, debe devolverla sin llamar a yt-dlp."""
        url, headers = _extract_audio_url_sync("known_video")
        assert url == "https://cached.url/audio"
        assert headers == {"UA": "test"}
        mock_get_cached.assert_called_once_with("known_video")

    @patch("streaming.get_cached_url", return_value=(None, None))
    @patch("streaming._ydl_get_url", return_value=("https://stream.url/audio", {}))
    @patch("streaming.cache_url")
    def test_ytdlp_success_default(self, mock_cache, mock_ydl, mock_get_cached):
        """Si el default (android VR) funciona, debe devolver esa URL sin llamar a otros clients."""
        url, headers = _extract_audio_url_sync("vid1")
        # El default se llama SIN extractor_args (solo videoId)
        mock_ydl.assert_called_once_with("vid1")
        mock_cache.assert_called_once()
        assert url == "https://stream.url/audio"

    @patch("streaming._ydl_get_url_with_cookies", side_effect=RuntimeError("no cookies"))
    @patch("streaming.get_cached_url", return_value=(None, None))
    @patch(
        "streaming._ydl_get_url",
        side_effect=[
            RuntimeError("default fail"),
            ("https://fallback.url", {}),
        ],
    )
    @patch("streaming.cache_url")
    def test_ytdlp_fallback_after_default_fails(
        self, mock_cache, mock_ydl, mock_get_cached, mock_cookies
    ):
        """Si el default falla, debe intentar tv_embedded."""
        url, headers = _extract_audio_url_sync("vid2")
        assert url == "https://fallback.url"
        assert mock_cache.called

    @patch("streaming._ydl_get_url_with_cookies", side_effect=RuntimeError("no cookies"))
    @patch("streaming.get_cached_url", return_value=(None, None))
    @patch("streaming._ydl_get_url", side_effect=RuntimeError("no audio"))
    def test_ytdlp_all_fail_raises(self, mock_ydl, mock_get_cached, mock_cookies):
        """Si todos los clients fallan, debe lanzar RuntimeError."""
        with pytest.raises(RuntimeError, match="Sin audio para"):
            _extract_audio_url_sync("vid_fail")

    @patch("streaming.get_cached_url", return_value=(None, None))
    @patch("streaming._ydl_get_url", return_value=("https://stream.url/audio", {}))
    @patch("streaming.cache_url")
    def test_clears_in_flight_after_success(
        self, mock_cache, mock_ydl, mock_get_cached
    ):
        """Después de obtener URL, debe limpiar in_flight."""
        from streaming import in_flight, in_flight_lock

        _extract_audio_url_sync("vid_clear")
        with in_flight_lock:
            assert "vid_clear" not in in_flight

    @patch("streaming._ydl_get_url_with_cookies", side_effect=RuntimeError("no cookies"))
    @patch("streaming.get_cached_url", return_value=(None, None))
    @patch("streaming._ydl_get_url", side_effect=RuntimeError("fail"))
    def test_clears_in_flight_after_error(self, mock_ydl, mock_get_cached, mock_cookies):
        """Incluso en error, debe limpiar in_flight."""
        from streaming import in_flight, in_flight_lock

        with pytest.raises(RuntimeError):
            _extract_audio_url_sync("vid_error")
        with in_flight_lock:
            assert "vid_error" not in in_flight


class TestPrefetch:
    """Tests para prefetch()."""

    @patch("streaming.get_cached_url", return_value=("cached", {}))
    @patch("streaming._extract_audio_url_sync")
    def test_prefetch_skips_if_cached(self, mock_extract, mock_get_cached):
        """Si la URL ya está en caché, prefetch no debe hacer nada."""
        prefetch("known_vid")
        mock_extract.assert_not_called()

    @patch("streaming.get_cached_url", return_value=(None, None))
    @patch("streaming._extract_audio_url_sync")
    def test_prefetch_calls_extract_if_not_cached(self, mock_extract, mock_get_cached):
        """Si no está en caché, prefetch debe llamar a _extract_audio_url_sync."""
        prefetch("fresh_vid")
        mock_extract.assert_called_once_with("fresh_vid")

    @patch("streaming.get_cached_url", return_value=(None, None))
    @patch("streaming._extract_audio_url_sync", side_effect=RuntimeError("fail"))
    def test_prefetch_swallows_errors(self, mock_extract, mock_get_cached):
        """prefetch debe tragar errores silenciosamente."""
        prefetch("error_vid")  # no debe lanzar excepción
        mock_extract.assert_called_once_with("error_vid")


class TestInFlightCoordination:
    """Tests para la coordinación entre threads (in_flight)."""

    @patch("streaming.get_cached_url", return_value=(None, None))
    @patch("streaming._ydl_get_url", return_value=("https://stream.url", {}))
    @patch("streaming.cache_url")
    def test_waiter_gets_result_from_primary(
        self, mock_cache, mock_ydl, mock_get_cached
    ):
        """Un waiter thread debe recibir el resultado del thread principal."""

        results = []

        def primary():
            url, _ = _extract_audio_url_sync("coord_vid")
            results.append(("primary", url))

        def waiter():
            url, _ = _extract_audio_url_sync("coord_vid")
            results.append(("waiter", url))

        t1 = threading.Thread(target=primary)
        t2 = threading.Thread(target=waiter)
        t1.start()
        t2.start()
        t1.join(timeout=5)
        t2.join(timeout=5)

        assert len(results) == 2
        assert results[0][1] == results[1][1]  # Ambos obtienen misma URL
