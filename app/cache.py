"""Tiny on-disk JSON cache so repeat lookups are instant and we don't hammer sources."""
import functools
import hashlib
import json
import os
import time

DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cache")
os.makedirs(DIR, exist_ok=True)

HOUR = 3600
DAY = 24 * HOUR


def _path(key):
    return os.path.join(DIR, hashlib.sha1(key.encode("utf-8")).hexdigest() + ".json")


def get(key, ttl):
    p = _path(key)
    try:
        if time.time() - os.path.getmtime(p) < ttl:
            with open(p, encoding="utf-8") as f:
                return json.load(f)
    except (OSError, ValueError):
        pass
    return None


def put(key, value):
    tmp = _path(key) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False)
    os.replace(tmp, _path(key))


def cached(ttl):
    def deco(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            key = f"{fn.__module__}.{fn.__name__}:{json.dumps([args, kwargs], sort_keys=True, default=str)}"
            hit = get(key, ttl)
            if hit is not None:
                return hit
            val = fn(*args, **kwargs)
            if val is not None:
                put(key, val)
            return val

        return wrapper

    return deco
