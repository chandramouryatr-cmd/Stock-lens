"""Shared HTTP session with polite per-host rate limiting."""
import threading
import time
from urllib.parse import urlparse

import requests

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)

_session = requests.Session()
_session.headers.update({"User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9"})

# Minimum seconds between two requests to the same host (be a good citizen).
_MIN_GAP = {"www.zaubacorp.com": 0.6, "www.screener.in": 0.35, "news.google.com": 0.2}
_last = {}
_lock = threading.Lock()


def _wait(host):
    gap = _MIN_GAP.get(host, 0.1)
    with _lock:
        now = time.monotonic()
        nxt = max(now, _last.get(host, 0) + gap)
        _last[host] = nxt
    delay = nxt - time.monotonic()
    if delay > 0:
        time.sleep(delay)


def fetch(url, method="GET", params=None, data=None, headers=None, timeout=20):
    host = urlparse(url).netloc
    err = None
    for attempt in range(2):
        _wait(host)
        try:
            r = _session.request(method, url, params=params, data=data, headers=headers, timeout=timeout)
            if r.status_code == 429:
                time.sleep(2 + attempt * 2)
                continue
            r.raise_for_status()
            if not r.encoding or r.encoding.lower() == "iso-8859-1":
                r.encoding = "utf-8"
            return r
        except requests.RequestException as e:  # retry once
            err = e
            time.sleep(1)
    raise RuntimeError(f"Could not fetch {url}: {err or 'rate limited'}")


def get_text(url, **kw):
    return fetch(url, **kw).text


def get_json(url, **kw):
    return fetch(url, **kw).json()
