"""Recent news from Google News RSS (free), tagged with simple, transparent risk keywords."""
import re
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

from .cache import HOUR, cached
from .net import get_text

# Each tag: (label, severity, regex). Kept deliberately simple and visible so you can see WHY
# a headline was flagged. Keyword matching is a hint, not a verdict: always read the article.
TAGS = [
    ("Fraud / scam", "high", r"\bfraud\w*|\bscam\w*|\bsiphon\w*|\bforg(ed|ery)\b|\bponzi\b|accounting irregularit\w*|\bstock manipulat\w*|\bfront.?running"),
    ("Bribery / indictment", "high", r"\bbrib\w*|\bindict\w*|\bcorrupt\w*|\bkickback\w*|\bcriminal charge\w*"),
    ("Raid / arrest", "high", r"\braid\w*|\barrest\w*|\bsearch(es)? and seizure|\bI-T search|\bincome tax search"),
    ("Enforcement agency", "high", r"\bED\b.{0,40}\b(raid|probe|summon|case|search|attach|arrest|notice|seiz)\w*|\b(raid|probe|summon|search|attach|arrest|seiz)\w*.{0,40}\bED\b|enforcement directorate|\bCBI\b|\bSFIO\b|\bDRI\b|money.laundering|\bPMLA\b"),
    ("Insolvency / default", "high", r"\bbankrupt\w*|\bdefault(s|ed)? on\b|\bdefaulted\b|insolvency (petition|proceedings) (against|filed)|admitted (into|to) insolvency"),
    ("Insolvency court", "medium", r"\bNCLT\b|\bIBC\b|\binsolven\w*|\bliquidat\w*|\bdefault\b"),
    ("Auditor issue", "high", r"auditor\w* (resign|quit|exit)\w*|qualified opinion|forensic audit|whistle.?blower"),
    ("Regulator action", "medium", r"\bSEBI\b.*\b(order|bar|ban|penalt|notice|probe|fine|settle)\w*|show.cause|\bRBI\b.*\b(penalt|curb|restrict)\w*|\bUS SEC\b|\bSEC (charges|probe|sues|complaint|summons)"),
    ("Short-seller / governance", "medium", r"short.?seller|\bHindenburg\b|governance (concern|lapse|issue)\w*|related.party (concern|transaction\w* (probe|flag))"),
    ("Legal / tax", "medium", r"\blawsuit\w*|\bsued\b|\blitigation\b|\bcourt\b|\bHC\b|\bFIR\b|charge.?sheet|tax demand|\bGST\b.*\b(notice|demand|evasion)|\bpenalt\w*|\bfined?\b|\bdefamation\b|\bsummon\w*"),
    ("Probe", "medium", r"\bprobe\w*|\binvestigat\w*"),
    ("Pledge", "medium", r"\bpledg\w*|encumbr\w*"),
    ("Leadership exit", "medium", r"\bresign\w*|steps? down|\bquits?\b|\bsacked\b|\bousted\b"),
    ("Rating cut", "medium", r"\bdowngrad\w*|rating (cut|lowered)|negative outlook|credit watch"),
    ("Business stress", "low", r"\blayoffs?\b|job cuts|\bplunge\w*|\bslump\w*|\bcrash\w*|\btank(s|ed)?\b|loss widen\w*|\bshutdown\b|\brecall\w*|\bstrike\b|profit (falls|drops|declines)|\bunder pressure\b"),
    ("Positive", "positive", r"\bwins?\b.*\b(order|contract|deal)|\bbags?\b|\border win|\bupgrad\w*|\brecord (high|profit|revenue)|\bexpan\w*|\bacquir\w*|\bbuyback\b|profit (rises|jumps|surges)|\bbeats? estimates"),
]
# Agency acronyms (ED, CBI, SEC...) must match in capitals, everything else is case-insensitive.
_CASE_SENSITIVE = {"Enforcement agency"}
_COMPILED = [(l, s, re.compile(rx, 0 if l in _CASE_SENSITIVE else re.I)) for l, s, rx in TAGS]
SEV_RANK = {"high": 3, "medium": 2, "low": 1, "positive": 0}


# Headlines about the company *fighting* fraud (awareness campaigns, customer alerts) are not risk.
_BENIGN = re.compile(r"awareness|prevent\w*|protect (yourself|customers)|beware|alerts? customers|cyber.?safety|campaign|tips to", re.I)


def tag(title):
    tags, seen = [], set()
    benign = bool(_BENIGN.search(title))
    for label, sev, rx in _COMPILED:
        if benign and label in ("Fraud / scam", "Probe"):
            continue
        hit = rx.search(title)
        if not hit and label in _CASE_SENSITIVE:
            hit = re.search(r"enforcement directorate|money.laundering", title, re.I)
        # "Insolvency court" is the soft version of "Insolvency / default": skip if the hard one already hit
        if hit and not (label == "Insolvency court" and "Insolvency / default" in seen):
            seen.add(label)
            tags.append({"label": label, "severity": sev, "match": hit.group(0)})
    return tags


RISK_TERMS = (
    "fraud OR probe OR SEBI OR raid OR ED OR CBI OR default OR insolvency OR NCLT OR penalty OR lawsuit "
    "OR resigns OR pledge OR bribery OR indictment OR downgrade OR auditor OR whistleblower OR arrested"
)


@cached(HOUR)
def search(q, limit=40, scan=False, period="1y"):
    """scan=True runs a risk sweep: the same entity, but only stories mentioning risk words (last 3 years)."""
    q = q.strip()
    if not q or len(q) > 200:
        raise ValueError("Bad query")
    if scan:
        q, period = f"({q}) ({RISK_TERMS})", "3y"
    xml = get_text(
        "https://news.google.com/rss/search",
        params={"q": f"{q} when:{period}", "hl": "en-IN", "gl": "IN", "ceid": "IN:en"},
    )
    root = ET.fromstring(xml.encode("utf-8"))
    items, seen = [], set()
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        src_el = it.find("source")
        source = (src_el.text or "").strip() if src_el is not None else ""
        if source and title.endswith(" - " + source):
            title = title[: -len(source) - 3]
        key = re.sub(r"\W+", "", title.lower())[:80]
        if not title or key in seen:
            continue
        seen.add(key)
        try:
            ts = parsedate_to_datetime(it.findtext("pubDate")).timestamp()
        except (TypeError, ValueError):
            ts = 0
        tags = tag(title)
        risk = max([SEV_RANK[t["severity"]] for t in tags if t["severity"] != "positive"] or [0])
        items.append({
            "title": title, "link": it.findtext("link"), "source": source, "ts": ts,
            "tags": tags, "risk": risk,
        })
    items.sort(key=lambda x: -x["ts"])
    return items[:limit]
