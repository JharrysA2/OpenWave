"""Tests para backend/cache.py."""

import time

from cache import (
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
