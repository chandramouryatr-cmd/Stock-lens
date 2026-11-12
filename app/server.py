"""Stock Lens local server. Run:  python run.py --open   (serves http://127.0.0.1:8770)"""
import json
import os
import sys
import traceback
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from . import news, screener, zauba

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC = os.path.join(ROOT, "static")
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
