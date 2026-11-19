"""Stock Lens local server. Run:  python run.py --open   (serves http://127.0.0.1:8770)"""
import json
import os
import sys
import traceback
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from . import ask, news, screener, zauba

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC = os.environ.get("STOCK_LENS_STATIC") or os.path.join(ROOT, "static")
PORT = int(os.environ.get("PORT", "8770"))


def _one(qs, key, default=None):
    v = qs.get(key)
    return v[0] if v else default


def route(path, qs):
    if path == "/api/search":
        return screener.search(_one(qs, "q", ""))
    if path == "/api/company":
        return screener.company(_one(qs, "path"), light=_one(qs, "light") == "1")
    if path == "/api/price":
        return screener.price(_one(qs, "symbol"), _one(qs, "range", "1y"))
    if path == "/api/commodities":
        return screener.commodities()
    if path == "/api/sectors":
        return screener.sectors()
    if path == "/api/quote":
        return screener.quote(_one(qs, "symbols", ""))
    if path == "/api/ask-status":
        return ask.status()
    if path == "/api/ohlc":
        return screener.ohlc(_one(qs, "symbol"), _one(qs, "view", "daily"))
    if path == "/api/index":
        return screener.index_list(_one(qs, "name", ""))
    if path == "/api/dividends":
        return screener.dividends(_one(qs, "symbol"))
    if path == "/api/valuation":
        return screener.valuation(_one(qs, "id"), _one(qs, "consolidated") == "1")
    if path == "/api/people":
        return zauba.people(_one(qs, "name"))
    if path == "/api/entity":
        prof = zauba.company_profile(_one(qs, "url"))
        listed = screener.best_match(prof["name"]) if prof.get("listed") and prof.get("name") else None
        return {**prof, "screener": listed}
    if path == "/api/match":
        return screener.best_match(_one(qs, "name", ""))
    if path == "/api/news":
        return news.search(_one(qs, "q", ""), scan=_one(qs, "scan") == "1")
    if path == "/api/market-news":
        return news.market()
    raise LookupError("Unknown endpoint")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("%s\n" % (fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        u = urlparse(self.path)
        if not u.path.startswith("/api/"):
            return super().do_GET()
        try:
            body, status = route(u.path, parse_qs(u.query)), 200
        except (ValueError, LookupError) as e:
            body, status = {"error": str(e)}, 400
        except Exception as e:  # upstream source failed
            traceback.print_exc()
            body, status = {"error": str(e)}, 502
        self._json(body, status)

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != "/api/ask":
            return self._json({"error": "Unknown endpoint"}, 404)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > 200_000:
                raise ValueError("Question is empty or too long.")
            body, status = ask.ask(json.loads(self.rfile.read(n).decode("utf-8"))), 200
        except LookupError:
            body, status = {"error": "NO_KEY"}, 400
        except ValueError as e:
            body, status = {"error": str(e)}, 400
        except RuntimeError as e:
            body, status = {"error": str(e)}, 502
        except Exception as e:
            traceback.print_exc()
            body, status = {"error": "Something went wrong asking Claude: " + str(e)}, 502
        self._json(body, status)

    def _json(self, body, status):
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def _lan_ip():
    """This computer's address on the local network (no data is sent to find it)."""
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("192.0.2.1", 9))
        return s.getsockname()[0]
    except OSError:
        return "this-computer's-IP"
    finally:
        s.close()


_bg = None
_bg_lock = __import__("threading").Lock()


def start_background(port=PORT):
    """Used by the Android app: serve on this device only, in a background thread.
    Safe to call twice, even at the same moment (the app can be opened twice quickly)."""
    global _bg
    import errno
    import threading
    with _bg_lock:
        if _bg is None:
            try:
                srv = ThreadingHTTPServer(("127.0.0.1", int(port)), Handler)
            except OSError as e:
                # Already being served (e.g. by the app's previous run that is still closing): use that one.
                if e.errno in (errno.EADDRINUSE, 98):
                    return f"http://127.0.0.1:{int(port)}"
                raise
            srv.daemon_threads = True
            threading.Thread(target=srv.serve_forever, name="stock-lens", daemon=True).start()
            _bg = srv
    return f"http://127.0.0.1:{int(port)}"


def main():
    # --lan lets other devices on the same Wi-Fi (your phone) open it. Without it, only this computer can.
    lan = "--lan" in sys.argv
    srv = ThreadingHTTPServer(("0.0.0.0" if lan else "127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}"
    print(f"Stock Lens running at {url}  (Ctrl+C to stop)")
    if lan:
        print(f"On your phone (same Wi-Fi) open:  http://{_lan_ip()}:{PORT}")
    if "--open" in sys.argv:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
