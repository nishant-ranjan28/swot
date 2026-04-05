from cachetools import TTLCache
from config import CACHE_TTL, CACHE_MAX_SIZE


class CacheManager:
    def __init__(self):
        self._caches = {}

    def _get_or_create_cache(self, category: str, ttl: int | None = None) -> TTLCache:
        cache_key = f"{category}_{ttl}" if ttl else category
        if cache_key not in self._caches:
            resolved_ttl = ttl or CACHE_TTL.get(category, 300)
            max_size = CACHE_MAX_SIZE.get(category, CACHE_MAX_SIZE.get("data", 500))
            self._caches[cache_key] = TTLCache(maxsize=max_size, ttl=resolved_ttl)
        return self._caches[cache_key]

    def get(self, category: str, key: str):
        cache = self._get_or_create_cache(category)
        return cache.get(key)

    def set(self, category: str, key: str, value, ttl: int | None = None):
        cache = self._get_or_create_cache(category, ttl)
        cache[key] = value

    def clear(self, category: str):
        keys_to_remove = [k for k in self._caches if k == category or k.startswith(f"{category}_")]
        for k in keys_to_remove:
            self._caches[k].clear()


# Singleton instance
cache_manager = CacheManager()
