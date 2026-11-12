"""Directors, key managers and their other companies from ZaubaCorp (public MCA records)."""
import difflib
import json
import re
from concurrent.futures import ThreadPoolExecutor

from bs4 import BeautifulSoup

from .cache import DAY, cached
from .net import get_text

Z = "https://www.zaubacorp.com"

CIN_RE = re.compile(r"([LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})")
CIN_TYPES = {
    "PLC": "Public company", "PTC": "Private company", "NPL": "Not-for-profit (Sec. 8)",
    "GOI": "Central Govt company", "SGC": "State Govt company", "OPC": "One-person company",
    "FTC": "Subsidiary of foreign co.", "GAP": "Guarantee & association (public)",
    "GAT": "Guarantee & association (private)", "ULL": "Unlimited liability (public)",
    "ULT": "Unlimited liability (private)",
}


def clean(s):
    return re.sub(r"\s+", " ", (s or "").replace("\xa0", " ")).strip()


def cin_info(cin):
    if not cin or len(cin) != 21:
        return {}
    return {
        "cin": cin,
        "listed": cin[0] == "L",
        "state": cin[6:8],
        "year": cin[8:12],
        "type": CIN_TYPES.get(cin[12:15], cin[12:15]),
    }


def _norm(n):
    n = n.upper().replace("&", " AND ")
    n = re.sub(r"\b(LTD|LIMITED|PVT|PRIVATE)\b\.?", " ", n)
    return re.sub(r"[^A-Z0-9]", "", n)


def _search_name(n):
    return clean(re.sub(r"\b(ltd|limited|pvt|private)\b\.?", " ", n, flags=re.I))


@cached(7 * DAY)
def find_company(name):
    html = get_text(Z + "/typeahead", method="POST", data={"search": _search_name(name), "filter": "company"})
    cands = []
    for slug, title in re.findall(r"<div class=show align=left id=([^>\s]+)>(.*?)</div>", html, re.S):
        m = CIN_RE.search(slug)
        if not m:
            continue
        cands.append({"name": clean(title), "cin": m.group(1), "url": f"{Z}/{slug}"})
    if not cands:
        return None
    key = _norm(name)

    def score(c):
        s = difflib.SequenceMatcher(None, key, _norm(c["name"])).ratio()
        if _norm(c["name"]) == key:
            s += 1
        if c["cin"].startswith("L"):
            s += 0.15  # we are usually looking up a listed company
        return s

    best = max(cands, key=score)
    return best if score(best) >= 0.75 else None


def _ld_org(soup):
    for s in soup.find_all("script", type="application/ld+json"):
        try:
            d = json.loads(s.string or "")
        except ValueError:
            continue
        for item in d if isinstance(d, list) else [d]:
            if isinstance(item, dict) and item.get("@type") == "Organization":
                return item
    return {}


def _rx(pattern, text):
    m = re.search(pattern, text or "")
    return clean(m.group(1)) if m else None


HEADINGS = ("h2", "h3", "h4", "h5")


def _money(s):
    try:
        return float(s.replace(",", "")) if s else None
    except ValueError:
        return None


def _table_after(soup, phrase):
    """The table that sits under the heading starting with `phrase` (not under a later heading)."""
    h = soup.find(lambda t: t.name in HEADINGS and clean(t.get_text()).lower().startswith(phrase.lower()))
    if not h:
        return None
    for el in h.find_all_next(["table", *HEADINGS]):
        if el.name == "table":
            return el
        if el.name in HEADINGS and clean(el.get_text()):
            return None
    return None


def _rows(table):
    if table is None:
        return []
    heads = [clean(th.get_text()).lower() for th in table.select("thead th")]
    out = []
    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if not tds:
            continue
        row = {}
        for h, td in zip(heads, tds):
            row[h] = clean(td.get_text())
            a = td.find("a", href=True)
            if a and "url" not in row:
                row["url"] = a["href"]
        out.append(row)
    return out


@cached(3 * DAY)
def company_profile(url):
    if not url.startswith(Z + "/"):
        raise ValueError("Bad url")
    soup = BeautifulSoup(get_text(url), "lxml")
    ld = _ld_org(soup)
    desc = ld.get("description", "")
    cin = (ld.get("identifier") or {}).get("value") or (CIN_RE.search(url).group(1) if CIN_RE.search(url) else None)
    directors = []
    for r in _rows(_table_after(soup, "Current Directors")):
        directors.append({
            "din": r.get("din"), "name": r.get("director name"), "designation": r.get("designation"),
            "appointed": r.get("appointment date"), "url": r.get("url"),
        })
    current_dins = {d["din"] for d in directors}
    past = [
        {"name": a.get("name"), "role": a.get("jobTitle"), "din": a.get("identifier")}
        for a in ld.get("alumni", []) if a.get("identifier") not in current_dins
    ]
    return {
        "name": ld.get("legalName") or ld.get("name"),
        "url": url,
        "founded": ld.get("foundingDate"),
        "address": ld.get("address"),
        "status": _rx(r"Current status of .*? is - ([^.]+)\.", desc),
        "paid_up_capital": _money(_rx(r"paid up capital is Rs\.? ?([\d,]+(?:\.\d+)?)", desc)),
        "authorised_capital": _money(_rx(r"authorized share capital is Rs\.? ?([\d,]+(?:\.\d+)?)", desc)),
        "last_balance_sheet": _rx(r"balance sheet was last filed on (\d{4}-\d{2}-\d{2})", desc),
        "last_agm": _rx(r"\(AGM\) was last held on ([^.]+)\.", desc),
        "roc": _rx(r"registered at (Registrar of Companies, [^.]+)\.", desc),
        "activity": _rx(r"NIC code, it is in[a-z]*ved in ([^\[.]{3,160})", desc),
        "directors": directors,
        "past_officers": past,
        **cin_info(cin),
    }


@cached(3 * DAY)
def director(url):
    if not url.startswith(Z + "/"):
        raise ValueError("Bad url")
    soup = BeautifulSoup(get_text(url), "lxml")
    about = ""
    h = soup.find(lambda t: t.name in ("h2", "h3", "h4", "h5") and t.get_text().strip().startswith("About"))
    if h:
        p = h.find_next("p")
        about = clean(p.get_text()) if p else ""

    def comps(phrase):
        out = []
        for r in _rows(_table_after(soup, phrase)):
            m = CIN_RE.search(r.get("url", ""))
            out.append({
                "name": r.get("company"), "url": r.get("url"),
                "designation": r.get("designation"),
                "appointed": r.get("date of appointment") or r.get("appointment date"),
                "ceased": r.get("date of cessation") or r.get("cessation date"),
                **cin_info(m.group(1) if m else None),
            })
        return out

    return {
        "url": url, "about": about,
        "current": comps("Companies Associated With"),
        "past": comps("Past Companies Associated With"),
    }


def _safe_director(d):
    try:
        return {**d, **director(d["url"])} if d.get("url") else d
    except Exception as e:
        return {**d, "error": str(e)}


@cached(DAY)
def people(company_name):
    match = find_company(company_name)
    if not match:
        return {"found": False, "query": company_name}
    prof = company_profile(match["url"])
    with ThreadPoolExecutor(3) as ex:
        prof["directors"] = list(ex.map(_safe_director, prof["directors"]))
    prof["found"] = True
    return prof
