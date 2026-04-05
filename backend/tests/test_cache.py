import time
from utils.cache import CacheManager


def test_cache_set_and_get():
    cache = CacheManager()
    cache.set("search", "test_key", {"data": "value"})
    result = cache.get("search", "test_key")
    assert result == {"data": "value"}


def test_cache_miss_returns_none():
    cache = CacheManager()
    result = cache.get("search", "nonexistent")
    assert result is None


def test_cache_respects_ttl():
    cache = CacheManager()
    # Use a very short TTL override for testing
    cache.set("search", "expire_key", {"data": "old"}, ttl=1)
    time.sleep(1.5)
    result = cache.get("search", "expire_key")
    assert result is None


def test_cache_clear_category():
    cache = CacheManager()
    cache.set("search", "key1", "val1")
    cache.set("search", "key2", "val2")
    cache.clear("search")
    assert cache.get("search", "key1") is None
    assert cache.get("search", "key2") is None
