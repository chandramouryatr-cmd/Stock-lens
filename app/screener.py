"""Company fundamentals, ownership, peers and related parties from Screener.in (free, no login)."""
import re
from concurrent.futures import ThreadPoolExecutor

from bs4 import BeautifulSoup

from .cache import DAY, HOUR, cached
from .net import get_json, get_text

BASE = "https://www.screener.in"
HOLDER_CATS = [
    ("promoters", "Promoters"),
    ("foreign_institutions", "FIIs"),
    ("domestic_institutions", "DIIs"),
    ("government", "Government"),
    ("public", "Public"),
]


def clean(s):
    return re.sub(r"\s+", " ", (s or "").replace("\xa0", " ")).strip()


def num(s):
    if s is None:
        return None
    s = str(s).replace(",", "").replace("\xa0", " ")
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group()) if m else None


@cached(6 * HOUR)
def search(q):
    data = get_json(BASE + "/api/company/search/", params={"q": q})
    out = []
    for d in data:
        url = d.get("url") or ""
        if url.startswith("/company/"):
            out.append({"name": d.get("name"), "path": url, "id": d.get("id")})
    return out


def best_match(name):
    """Find the Screener page for a company name, or None if it isn't listed."""
    q = re.sub(r"\b(private|pvt|limited|ltd|the|of)\b\.?", " ", name, flags=re.I)
    q = clean(re.sub(r"[^\w& ]", " ", q))
    if len(q) < 3:
        return None
    try:
        res = search(q)
    except Exception:
        return None
    key = _norm(name)
    for r in res:
        if _norm(r["name"]) == key:
            return r
    return None


def _norm(n):
    n = n.upper().replace("&", " AND ")
    n = re.sub(r"\b(LTD|LIMITED|PVT|PRIVATE|CO|COMPANY|CORPN|CORPORATION|CORP|THE|OF|INDIA)\b\.?", " ", n)
    return re.sub(r"[^A-Z0-9]", "", n)


def _table(table):
    if table is None:
        return None
    heads = [clean(th.get_text()) for th in table.select("thead th")][1:]
    rows = []
    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if not tds:
            continue
        label = clean(tds[0].get_text()).rstrip("+").strip()
        rows.append({"label": label, "values": [num(td.get_text()) for td in tds[1:]]})
    return {"headers": heads, "rows": rows}


def _links_after(section, heading):
    h = section.find(lambda t: t.name in ("h3", "h2") and heading.lower() in t.get_text().lower())
    if not h:
        return []
    ul = h.find_next("ul")
    out = []
    for li in ul.find_all("li", recursive=False) if ul else []:
        links = [{"text": clean(a.find(string=True, recursive=False) or a.get_text()), "href": a["href"]}
                 for a in li.find_all("a", href=True)]
        date = li.find("div", class_=re.compile("nowrap"))
        sub = li.find("div", class_="smaller")
        out.append({
            "date": clean(date.get_text()) if date else "",
            "note": clean(sub.get_text()) if sub else "",
            "links": links,
        })
    return out


@cached(12 * HOUR)
def company(path, light=False):
    if not re.fullmatch(r"/company/[\w\-&.%]+/(consolidated/)?", path):
        raise ValueError("Bad company path")
    soup = BeautifulSoup(get_text(BASE + path), "lxml")
    holder = soup.select_one("[data-company-id]")
    cid = holder["data-company-id"] if holder else None
    wid_el = soup.select_one("[data-warehouse-id]")
    wid = wid_el["data-warehouse-id"] if wid_el else None

    ratios = []
    for li in soup.select("#top-ratios li"):
        n = li.select_one(".name")
        v = li.select_one(".value")
        if n and v:
            ratios.append({"name": clean(n.get_text()), "value": clean(v.get_text()), "num": num(v.get_text())})

    prof = soup.select_one(".company-profile")
    about = clean(re.sub(r"\[\d+\]", "", prof.select_one(".about").get_text())) if prof and prof.select_one(".about") else ""
    key_points = ""
    if prof and prof.select_one(".commentary"):
        c = prof.select_one(".commentary")
        for b in c.find_all("br"):
            b.replace_with("\n")
        key_points = "\n".join(clean(x) for x in re.sub(r"\[\d+\]", "", c.get_text()).split("\n") if clean(x))

    def first_href(sel):
        a = soup.select_one(sel)
        return a["href"] if a else None

    website = None
    if prof:
        for a in prof.find_all("a", href=True):
            if "Website" in a.get_text():
                website = a["href"]
                break
    bse = first_href('a[href*="bseindia.com/stock-share-price"]')
    nse = first_href('a[href*="nseindia.com/get-quotes/equity"]')
    bse_code = re.search(r"/(\d{6})/?", bse).group(1) if bse and re.search(r"/(\d{6})/?", bse) else None
    nse_symbol = re.search(r"symbol=([^&]+)", nse).group(1) if nse else None

    pros = [clean(li.get_text()) for li in soup.select("#analysis .pros li")]
    cons = [clean(li.get_text()) for li in soup.select("#analysis .cons li")]
    sector = [{"level": a.get("title"), "name": clean(a.get_text())} for a in soup.select("#peers p.sub a[title]")]

    tables = {}
    for sid in ["quarters", "profit-loss", "balance-sheet", "cash-flow", "ratios"]:
        sec = soup.select_one(f"section#{sid}")
        tables[sid] = _table(sec.select_one("table.data-table")) if sec else None

    growth = []
    for t in soup.select("table.ranges-table"):
        th = t.find("th")
        growth.append({
            "title": clean(th.get_text()) if th else "",
            "rows": [[clean(td.get_text()) for td in tr.find_all("td")] for tr in t.find_all("tr") if tr.find("td")],
        })

    shp_sec = soup.select_one("#quarterly-shp")
    shareholding = _table(shp_sec.select_one("table")) if shp_sec else None

    docs = soup.select_one("section#documents")
    announcements = []
    if docs:
        for a in docs.select("#company-announcements-tab li a"):
            t = a.find("time")
            sub = a.find("div")
            title = clean(a.find(string=True, recursive=False) or "")
            note = clean(sub.get_text()) if sub else ""
            if t and "-" in note:
                note = clean(note.split("-", 1)[1])
            announcements.append({"title": title, "date": t["datetime"] if t else "", "note": note, "href": a["href"]})

    out = {
        "path": path,
        "id": cid,
        "name": clean(soup.select_one("h1").get_text()) if soup.select_one("h1") else path,
        "consolidated": "consolidated" in path,
        "ratios": ratios,
        "about": about,
        "key_points": key_points,
        "website": website,
        "bse_code": bse_code,
        "nse_symbol": nse_symbol,
        "pros": pros,
        "cons": cons,
        "sector": sector,
        "tables": tables,
        "growth": growth,
        "shareholding": shareholding,
        "announcements": announcements[:15],
        "annual_reports": _links_after(docs, "Annual reports")[:6] if docs else [],
        "credit_ratings": _links_after(docs, "Credit ratings")[:6] if docs else [],
        "concalls": _links_after(docs, "Concalls")[:6] if docs else [],
        "url": BASE + path,
    }
    if light or not cid:
        return out

    with ThreadPoolExecutor(4) as ex:
        holders_f = {k: ex.submit(_holders, cid, k) for k, _ in HOLDER_CATS}
        peers_f = ex.submit(_peers, wid) if wid else None
        rpt_f = ex.submit(_related_parties, cid, out["consolidated"])
        holders = []
        for k, label in HOLDER_CATS:
            try:
                holders += [dict(h, category=label) for h in holders_f[k].result()]
            except Exception:
                pass
        last = shareholding["headers"][-1] if shareholding and shareholding["headers"] else None
        current = [h for h in holders if h["latest_period"] == last]
        # Notable exits: held >= 1% at some point in the window but missing from the latest quarter.
        exited = [
            dict(h, peak=max((p["value"] or 0) for p in h["series"]))
            for h in holders if h["latest_period"] != last and h["series"]
        ]
        out["holders"] = sorted(current, key=lambda h: -(h["latest"] or 0))[:40]
        out["exited_holders"] = sorted([h for h in exited if h["peak"] >= 1], key=lambda h: -h["peak"])[:10]
        out["peers"] = _safe(peers_f)
        out["related_parties"] = _safe(rpt_f)
    return out


def _safe(f):
    try:
        return f.result() if f else []
    except Exception:
        return []


def _holders(cid, cat):
    data = get_json(f"{BASE}/api/3/{cid}/investors/{cat}/quarterly/")
    out = []
    for name, series in (data or {}).items():
        attrs = series.pop("setAttributes", {}) if isinstance(series, dict) else {}
        pts = [{"period": k, "value": num(v)} for k, v in series.items()]
        out.append({
            "name": clean(name),
            "series": pts,
            "latest": pts[-1]["value"] if pts else None,
            "latest_period": pts[-1]["period"] if pts else None,
            "screener_person": attrs.get("data-person-url"),
        })
    return out


def _peers(wid):
    soup = BeautifulSoup(get_text(f"{BASE}/api/company/{wid}/peers/"), "lxml")
    heads = [clean(th.get_text()) for th in soup.select("th")]
    out = []
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        a = tr.find("a", href=True)
        if not tds or not a or not a["href"].startswith("/company/"):
            continue
        row = {"name": clean(a.get_text()), "path": a["href"]}
        for h, td in zip(heads, tds):
            if h not in ("S.No.", "Name", "Company"):
                row[h] = num(td.get_text())
        out.append(row)
    return out[:12]


def _related_parties(cid, consolidated):
    url = f"{BASE}/results/rpt/{cid}/" + ("consolidated/" if consolidated else "")
    soup = BeautifulSoup(get_text(url), "lxml")
    parties, cur = [], None
    for tr in soup.find_all("tr"):
        td = tr.find("td")
        if not td:
            continue
        if "strong" in (tr.get("class") or []):
            rel = td.find("small")
            relation = clean(rel.get_text()) if rel else ""
            if rel:
                rel.extract()
            cur = {"name": clean(td.get_text()), "relation": relation, "transactions": [], "years": []}
            parties.append(cur)
        elif cur is not None:
            label = clean(td.get_text())
            if label and label not in cur["transactions"]:
                cur["transactions"].append(label)
    heads = [clean(th.get_text()) for th in soup.select("thead th")][1:]
    # Merge duplicate names (Screener lists the same party once per relation label sometimes)
    merged = {}
    for p in parties:
        if p["name"].lower() in ("transactions", "others", "other", "total", ""):
            continue
        k = _norm(p["name"]) or p["name"].upper()
        if k in merged:
            merged[k]["transactions"] += [t for t in p["transactions"] if t not in merged[k]["transactions"]]
        else:
            merged[k] = p
    return {"parties": list(merged.values()), "years": heads}


@cached(12 * HOUR)
def valuation(cid, consolidated=True):
    """Five years of weekly P/E, EPS and delivery % from Screener's public chart API."""
    if not re.fullmatch(r"\d+", str(cid or "")):
        raise ValueError("Bad company id")
    url = f"{BASE}/api/company/{cid}/chart/"
    extra = {"days": 1825, "consolidated": "true"} if consolidated else {"days": 1825}

    def sets(q):
        try:
            return {d.get("metric"): d for d in get_json(url, params=dict(extra, q=q)).get("datasets", [])}
        except Exception:
            return {}

    a, b = sets("Price to Earning-Median PE-EPS"), sets("Price-DMA50-DMA200-Volume")
    pts = lambda d: [[v[0], num(v[1])] for v in (d or {}).get("values", []) if num(v[1]) is not None]
    med = pts(a.get("Median PE"))
    return {
        "pe": pts(a.get("Price to Earning")),
        "median_pe": med[-1][1] if med else None,
        "eps": pts(a.get("EPS")),
        "delivery": [[v[0], v[2].get("delivery")] for v in (b.get("Volume") or {}).get("values", [])
                     if len(v) > 2 and isinstance(v[2], dict) and v[2].get("delivery") is not None],
    }


INDEXES = {"nifty50": "ind_nifty50list", "nifty100": "ind_nifty100list", "nifty200": "ind_nifty200list", "nifty500": "ind_nifty500list"}


@cached(7 * DAY)
def index_list(name):
    """Companies in an NSE index (official CSV from the NSE archive)."""
    if name not in INDEXES:
        raise ValueError("Unknown index")
    import csv
    import io
    text = get_text(f"https://nsearchives.nseindia.com/content/indices/{INDEXES[name]}.csv")
    out = []
    for row in csv.DictReader(io.StringIO(text.lstrip("﻿"))):
        sym = clean(row.get("Symbol"))
        if sym:
            out.append({"name": clean(row.get("Company Name")), "symbol": sym, "industry": clean(row.get("Industry")),
                        "path": f"/company/{sym}/consolidated/"})
    return out


@cached(DAY)
def dividends(symbol):
    """Ten years of dividends and share splits from Yahoo Finance."""
    if not re.fullmatch(r"[\w\-&.]+\.(NS|BO)", symbol):
        raise ValueError("Bad symbol")
    d = get_json(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
        params={"range": "10y", "interval": "1mo", "events": "div,splits"},
    )
    ev = d["chart"]["result"][0].get("events", {}) or {}
    divs = sorted(([v["date"], v["amount"]] for v in (ev.get("dividends") or {}).values()), key=lambda x: x[0])
    splits = sorted(([v["date"], v.get("splitRatio") or f'{v.get("numerator")}:{v.get("denominator")}']
                     for v in (ev.get("splits") or {}).values()), key=lambda x: x[0])
    return {"dividends": divs, "splits": splits}


@cached(HOUR)
def price(symbol, rng="1y"):
    if not re.fullmatch(r"[\w\-&.]+\.(NS|BO)|\^NSEI", symbol) or rng not in ("1y", "5y"):
        raise ValueError("Bad symbol")
    d = get_json(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
        params={"range": rng, "interval": "1d"},
    )
    res = d["chart"]["result"][0]
    closes = res["indicators"]["quote"][0]["close"]
    pts = [[t, round(c, 2)] for t, c in zip(res["timestamp"], closes) if c is not None]
    meta = res.get("meta", {})
    return {"symbol": symbol, "points": pts, "currency": meta.get("currency"), "prev_close": meta.get("chartPreviousClose")}
