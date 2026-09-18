"""Tests para backend/cache.py."""

import time

from cache import (
    _prune_cache,
    api_cache_get,
    api_cache_set,
    cache_url,
    get_cached_url,
    url_disk_cache,
)


class TestApiCache:
    def test_get_missing(self):
        assert api_cache_get("nonexistent") is None

    def test_set_and_get(self):
        api_cache_set("key1", {"data": 42})
        result = api_cache_get("key1")
        assert result == {"data": 42}

    def test_expired(self):
        api_cache_set("key2", "value", ttl=0)
        result = api_cache_get("key2", ttl=0)
        assert result is None

    def test_different_keys(self):
        api_cache_set("a", 1)
        api_cache_set("b", 2)
        assert api_cache_get("a") == 1
        assert api_cache_get("b") == 2

    def test_none_value(self):
        api_cache_set("null_key", None)
        result = api_cache_get("null_key")
        assert result is None


class TestStreamCache:
    def test_missing(self):
        url, headers = get_cached_url("nonexistent")
        assert url is None
        assert headers is None

    def test_cache_and_retrieve(self):
        cache_url("vid1", "https://stream.example.com/audio", {"User-Agent": "test"})
        url, headers = get_cached_url("vid1")
        assert url == "https://stream.example.com/audio"
        assert headers == {"User-Agent": "test"}

    def test_separate_entries(self):
        cache_url("a", "url_a", {})
        cache_url("b", "url_b", {})
        url_a, _ = get_cached_url("a")
        url_b, _ = get_cached_url("b")
        assert url_a == "url_a"
        assert url_b == "url_b"

    def test_memory_cache_preferred(self, monkeypatch):
        """Memory cache should be checked before disk cache."""

        # Poner en memory cache
        cache_url("mem", "memory_url", {})
        # Poner valor diferente en disk cache
        url_disk_cache["mem"] = ("disk_url", {}, time.time())

        url, headers = get_cached_url("mem")
        assert url == "memory_url"


class TestPruning:
    def test_prune_removes_only_expired(self):
        """Al superar el límite, _prune_cache elimina solo entradas expiradas."""
        cache = {"k_old": ("x", 1), "k_fresh": ("x", time.time())}
        _prune_cache(cache, ttl=10, max_entries=2)
        assert "k_old" not in cache
        assert "k_fresh" in cache

    def test_prune_not_triggered_below_limit(self):
        """Con < max_entries no se toca nada aunque haya expiradas."""
        cache = {"k_exp": ("x", 1)}
        _prune_cache(cache, ttl=10, max_entries=500)
        assert "k_exp" in cache

    def test_api_cache_set_prunes_over_entries(self, monkeypatch):
        """api_cache_set llama a la poda (entry count no crece sin control)."""
        seen = {}

        def spy(cache, ttl, max_entries=500):
            seen["max"] = max_entries

        monkeypatch.setattr("cache._prune_cache", spy)
        api_cache_set("k", "v")
        assert seen["max"] == 500


class TestDebouncedSaver:
    def test_second_cache_url_does_not_duplicate_writer(self, mocker, monkeypatch):
        """cache_url consecutivo no lanza un thread de escritura por llamada."""
        import cache as cache_mod

        monkeypatch.setattr(cache_mod, "_url_cache_writer_active", False)
        monkeypatch.setattr(cache_mod, "_url_cache_dirty", False)
        thread_start = mocker.patch("cache.threading.Thread.start")
        cache_url("deb1", "u1", {})
        cache_url("deb2", "u2", {})
        assert thread_start.call_count == 1
        monkeypatch.setattr(cache_mod, "_url_cache_writer_active", False)
        monkeypatch.setattr(cache_mod, "_url_cache_dirty", False)
