from threading import RLock

from cachetools import TLRUCache
from config import CACHE_TTL, CACHE_MAX_SIZE


class CacheManager:
    def __init__(self):
        self._caches = {}
        self._lock = RLock()

    def _get_or_create_cache(self, category: str) -> TLRUCache:
        if category not in self._caches:
            max_size = CACHE_MAX_SIZE.get(category, CACHE_MAX_SIZE.get("data", 500))
            # Keep each category in one cache. Per-entry TTLs must not change the
            # lookup namespace (get() doesn't receive the writer's TTL).
            self._caches[category] = TLRUCache(
                maxsize=max_size, ttu=lambda key, entry, now: now + entry[1]
            )
        return self._caches[category]

    def get(self, category: str, key: str):
        with self._lock:
            entry = self._get_or_create_cache(category).get(key)
            return entry[0] if entry is not None else None

    def set(self, category: str, key: str, value, ttl: int | None = None):
        with self._lock:
            resolved_ttl = ttl if ttl is not None else CACHE_TTL.get(category, 300)
            self._get_or_create_cache(category)[key] = (value, resolved_ttl)

    def clear(self, category: str):
        with self._lock:
            cache = self._caches.get(category)
            if cache is not None:
                cache.clear()


# Singleton instance
cache_manager = CacheManager()
