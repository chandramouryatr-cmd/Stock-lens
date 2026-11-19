/* Market news on the home page: India and world headlines, split into
   "positive for Indian stocks" and "negative for Indian stocks" by simple, visible word rules.
   Each headline shows WHY it landed where it did. A sorting aid, not a forecast. */
(function () {
  "use strict";

  // What moved, and whether that thing going UP is good (+1) or bad (-1) for Indian shares.
  // up / down: plain-English reason shown under the headline. sectors: who feels it most.
  const SUBJECTS = [
    { key: "india", name: "Indian market", sign: +1,
      rx: /\b(sensex|nifty(\s?50|\sbank|\sit|\smidcap\w*|\ssmallcap\w*)?|indian (shares|stocks|equities|markets?)|dalal street|d-street|benchmark indices|markets? (in india|today))\b/i,
      up: "Indian shares themselves moved up.", down: "Indian shares themselves moved down." },
    { key: "fii", name: "Foreign investors", sign: +1,
      rx: /\b(fiis?|fpis?|foreign (portfolio )?investors?|foreign (funds|money|inflows?|outflows?))\b/i,
      up: "Foreign investors putting money in usually lifts Indian share prices.",
      down: "Foreign investors pulling money out usually pushes Indian share prices down." },
    { key: "rupee", name: "Rupee", sign: +1, rx: /\b(rupee|inr)\b/i,
      up: "A stronger rupee makes imports cheaper and keeps foreign money coming in.",
      down: "A weaker rupee makes imports (oil, electronics) dearer and can scare foreign money away.",
      sectors: { up: "Helps oil marketers, airlines, importers; slightly hurts IT and pharma exporters.", down: "Helps IT and pharma exporters (they earn in dollars); hurts importers and companies with dollar loans." } },
    { key: "dollar", name: "US dollar", sign: -1, rx: /\b(dollar index|dxy|us dollar|greenback)\b/i,
      up: "A strong dollar tends to pull money out of markets like India.", down: "A softer dollar tends to send money towards markets like India." },
    { key: "crude", name: "Crude oil", sign: -1, rx: /\b(crude( oil)?|brent|wti|oil prices?)\b/i,
      up: "India imports most of its oil, so costlier oil raises costs, prices and the import bill.",
      down: "India imports most of its oil, so cheaper oil lowers costs and helps the rupee.",
      sectors: { up: "Hurts paints, tyres, airlines, chemicals, oil marketers (BPCL, HPCL, IOC); helps ONGC and Oil India.", down: "Helps paints, tyres, airlines, chemicals, oil marketers; hurts ONGC and Oil India." } },
    { key: "inflation", name: "Inflation", sign: -1, rx: /\b(inflation|cpi|wpi|retail prices|price rise)\b/i,
      up: "Rising prices make rate cuts less likely and squeeze household budgets.",
      down: "Easing prices leave room for the RBI to cut interest rates." },
    { key: "rates", name: "Interest rates", sign: -1,
      rx: /\b(interest rates?|repo( rate)?|policy rates?|rates?(?= (cut|hike|unchanged))|bond yields?|treasury yields?|yields)\b|\b(rate (cut|hike)s?)\b/i,
      up: "Higher rates make loans dearer and make fixed deposits / bonds more attractive than shares.",
      down: "Lower rates make loans cheaper for companies and buyers, and shares more attractive.",
      sectors: { up: "Hurts real estate, autos, NBFCs; banks can gain on lending margins.", down: "Helps banks and NBFCs (more lending), real estate, autos, consumer durables." } },
    { key: "growth", name: "Economic growth", sign: +1, rx: /\b(gdp|economic growth|india('s|’s)? growth|growth rate|economy|pmi|iip|industrial output|gst collections?|exports)\b/i,
      up: "A faster-growing economy means more business for companies.", down: "A slower economy means less business for companies." },
    { key: "global", name: "Global stocks", sign: +1,
      rx: /\b(wall street(?!'s|’s| analysts?| journal| expects?| sees?| bullish| bearish)|dow( jones)?(?! chemical)|nasdaq|s&p( 500)?|us stocks|global (stocks|markets|equities)|asian (stocks|markets|shares)|nikkei|hang seng|european (stocks|markets))\b/i,
      up: "Indian markets often follow the global mood; a strong lead helps.", down: "Indian markets often follow the global mood; a weak lead weighs on them." },
  ];

  // Word for "went up" and "went down". "cut" and "eases" are DOWN: a rate cut is rates going down.
  const UP = /\b(rise|rises|rose|rising|gain(s|ed|ing)?|jump(s|ed|ing)?|surg(e|es|ed|ing)|soar(s|ed|ing)?|climb(s|ed|ing)?|rall(y|ies|ied|ying)|higher|strong(er)?|rais(e|es|ed|ing)|spik(e|es|ed|ing)|hik(e|es|ed|ing)|record high|all.time high|52.week high|one.year (high|peak)|strengthen(s|ed|ing)?|recover(s|ed|ing|y)?|accelerat(e|es|ed|ing)|rebound(s|ed|ing)?|beats?|inflows?|net buyers?|buy(s|ing)?|bought|pump(s|ed|ing)?|firm(s|ed|er)?|advanc(e|es|ed|ing)|up \d|extends? gains|hot(ter)?|sticky|expands?|grows?|grew)\b/i;
  const DOWN = /\b(fall|falls|fell|falling|drop(s|ped|ping)?|declin(e|es|ed|ing)|slump(s|ed|ing)?|plung(e|es|ed|ing)|crash(es|ed|ing)?|tumbl(e|es|ed|ing)|sink(s|ing)?|sank|slid(e|es|ing)?|slip(s|ped|ping)?|lower|weak(er)?|52.week low|cut(s|ting)?|eas(e|es|ed|ing)|cool(s|ed|ing)?|weaken(s|ed|ing)?|record low|all.time low|slow(s|ed|ing|down)?|contract(s|ed|ion)?|sell(ing|.?off|s)?|sold|outflows?|pull(s|ed|ing)? out|dump(s|ed|ing)?|exodus|net sellers?|shed(s|ding)?|bleed(s|ing)?|tank(s|ed|ing)?|retreat(s|ed|ing)?|dip(s|ped|ping)?|los(e|es|ing)|lost|losses|down \d|pares? (early |some |all |its |most )?gains|gives? up (early )?gains|snaps?|skid(s|ded)?|wipe(s|d)? out|erod(e|es|ed))\b/i;
  const HOLD = /\b(unchanged|on hold|keeps? .{0,20}(steady|unchanged)|holds? rates?|pause[sd]?)\b/i;

  // Events that matter without a clear "went up / down" verb.
  const EVENTS = [
    [-2, /\b(war|missile|air ?strikes?|military strike|attack(s|ed)?|invasion|escalat\w*|geopolitical (tension|risk)s?|border (tension|clash)\w*)\b/i, "Conflict / war", "War and conflict make investors nervous and can push up oil prices."],
    [+2, /\b(ceasefire|truce|peace (deal|talks|accord)|de-?escalat\w*)\b/i, "Tension easing", "Easing conflict calms investors and oil prices."],
    [-1.5, /\b(tariffs?|trade war|sanctions?|import (curbs|duty hike)|export ban)\b/i, "Trade barriers", "Tariffs and sanctions can hurt exporters and slow global trade."],
    [+2, /\b(trade (deal|pact|agreement)|fta|free trade)\b/i, "Trade deal", "Trade deals open markets for Indian exporters."],
    [-2, /\b(recession|slowdown fears?|stagflation|credit crisis|bank(ing)? crisis|default fears?)\b/i, "Recession fears", "Fear of a downturn makes investors sell shares."],
    [+1, /\b(stimulus|tax (cut|relief)|gst (cut|rationali[sz]ation)|capex push|reform\w*)\b/i, "Policy support", "Government support and reforms can lift company earnings."],
    [+1, /\b(rating upgrade|sovereign upgrade)\b/i, "Rating upgrade", "A better credit rating for India draws foreign money."],
    [+1, /\bupgrades? india\b|\b(india|indian (stocks|equities))\b.{0,30}\boverweight\b/i, "Brokerage upgrade", "A big brokerage turning positive on India can bring in foreign money."],
    [-1, /\bdowngrades? india\b|\b(india|indian (stocks|equities))\b.{0,30}\b(underweight|neutral)\b/i, "Brokerage downgrade", "A big brokerage turning cautious on India can push foreign money out."],
    [-1.5, /\b(rating downgrade|downgrades? india|fiscal (slippage|deficit widen\w*))\b/i, "Rating or fiscal worry", "Worries about government finances can push up borrowing costs."],
    [-1, /\b(volatil\w*|panic|fear gauge|india vix (jumps|surges|spikes))\b/i, "Nervous market", "Swings and fear usually mean selling pressure."],
  ];

  // Find "subject ... verb" (or "verb ... subject") close together and read the direction.
  // The verb nearest to the subject wins; the search stops where another subject starts,
  // so "CPI near 6% as rupee recovers" does not read "recovers" as inflation's verb.
  const ANY_SUBJECT = () => new RegExp(SUBJECTS.map((s) => s.rx.source).join("|"), "i");
  function direction(text, at, len) {
    let after = text.slice(at + len, at + len + 50).split(/[;:|,]/)[0];
    const nextSub = after.match(ANY_SUBJECT());
    if (nextSub) after = after.slice(0, nextSub.index);
    let before = text.slice(Math.max(0, at - 30), at);
    const prevSub = [...before.matchAll(new RegExp(ANY_SUBJECT().source, "gi"))].pop();
    if (prevSub) before = before.slice(prevSub.index + prevSub[0].length);
    const cands = [];
    const add = (str, rx, dir, isAfter) => {
      for (const m of str.matchAll(new RegExp(rx.source, "gi"))) cands.push({ dir, word: m[0], dist: isAfter ? m.index : str.length - (m.index + m[0].length) });
    };
    add(after, UP, +1, true); add(after, DOWN, -1, true); add(before, UP, +1, false); add(before, DOWN, -1, false);
    if (!cands.length) return null;
    cands.sort((a, b) => a.dist - b.dist);
    return cands[0];
  }

  function judge(title) {
    let score = 0;
    const why = [], sectors = [];
    // Several clauses ("Sensex falls; rupee gains") are read one at a time.
    for (let clause of title.split(/\s*[;|]\s*|\s+[-–—]\s+|:\s+/)) {
      // "rupee weakness eases" = the rupee is recovering; "markets mixed" = no single direction.
      clause = clause.replace(/\bweakness (eases|ends|fades)\b/i, "recovers").replace(/\bstrength (fades|eases)\b/i, "weakens");
      if (/\?\s*$/.test(clause)) continue; // a question ("Can inflows support the rupee?") is not news
      const mixed = /\b(mixed|flat|range.?bound|choppy)\b/i.test(clause);
      for (const s of SUBJECTS) {
        const m = clause.match(s.rx);
        if (!m) continue;
        if (mixed && (s.key === "india" || s.key === "global" || s.key === "rupee")) { why.push({ w: 0, label: `${s.name} flat or mixed`, text: "No clear move." }); continue; }
        if (s.key === "rates" && HOLD.test(clause)) { why.push({ w: 0, label: "Interest rates unchanged", text: "No change in rates: little direct effect." }); continue; }
        const d = direction(clause, m.index, m[0].length);
        if (!d) continue;
        const w = (s.key === "india" ? 3 : 2) * s.sign * d.dir; // the Indian market's own move counts most
        if (why.some((x) => x.key === s.key)) continue;
        score += w;
        why.push({ key: s.key, w, label: `${s.name} ${d.dir > 0 ? "up" : "down"} (“${m[0]} … ${d.word}”)`, text: d.dir > 0 ? s.up : s.down });
        if (s.sectors) sectors.push(d.dir > 0 ? s.sectors.up : s.sectors.down);
      }
    }
    for (const [w, rx, label, text] of EVENTS) {
      const m = title.match(rx);
      if (m) { score += w; why.push({ w, label: `${label} (“${m[0]}”)`, text }); }
    }
    const dir = score >= 1 ? "pos" : score <= -1 ? "neg" : "none";
    return { score, dir, strong: Math.abs(score) >= 3.5, why, sectors };
  }

  const ago = (ts) => {
    const s = Date.now() / 1000 - ts;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m";
    if (s < 86400) return Math.round(s / 3600) + "h";
    return Math.round(s / 86400) + "d";
  };

  const M = { data: null, tab: "pos", theme: "all", err: null, loading: false, at: 0 };

  async function load(force) {
    const { api } = window.SL;
    if (M.loading || (M.data && !force && Date.now() - M.at < 10 * 60 * 1000)) return;
    M.loading = true; M.err = null; draw();
    try {
      const groups = await api("/api/market-news");
      const seen = new Set(), items = [];
      for (const g of groups) for (const it of g.items) {
        const k = it.title.toLowerCase().replace(/\W+/g, "").slice(0, 60);
        if (seen.has(k)) continue;
        seen.add(k);
        items.push({ ...it, theme: g.theme, im: judge(it.title) });
      }
      items.sort((a, b) => b.ts - a.ts);
      M.data = { items, themes: groups.map((g) => g.theme) };
      M.at = Date.now();
    } catch (e) { M.err = e.message; }
    M.loading = false;
    draw();
  }

  /* ---------------------------------------------------------------- news search
     Type a stock (or any topic) to see its last 12 months of headlines, each marked likely positive /
     negative for that stock with the same word rules as a company's News tab. */
  const Q = { q: "", items: null, loading: false, err: null, tab: "all", tok: 0 };
  async function search(q) {
    Q.q = q.trim(); Q.tab = "all";
    if (Q.q.length < 2) { Q.items = null; draw(); return; }
    const my = ++Q.tok;
    Q.loading = true; Q.err = null; draw();
    try {
      const items = await window.SL.api("/api/news", { q: Q.q });
      if (my !== Q.tok) return;
      Q.items = items.map((x) => ({ ...x, im: window.SL.newsImpact(x, Q.q) }));
    } catch (e) { if (my === Q.tok) Q.err = e.message; }
    if (my === Q.tok) { Q.loading = false; draw(); }
  }
  function drawSearch(box) {
    const { esc, impactBadge } = window.SL;
    if (Q.loading) { box.innerHTML = `<div class="loading-line" style="padding:14px 0"><span class="spinner"></span>Finding news for “${esc(Q.q)}”…</div>`; return; }
    if (Q.err) { box.innerHTML = `<p class="muted">Couldn't search news: ${esc(Q.err)}</p>`; return; }
    const all = Q.items || [];
    const n = (d) => all.filter((x) => x.im.dir === d).length;
    const list = Q.tab === "all" ? all : all.filter((x) => x.im.dir === Q.tab);
    const seg = (k, label, c) => `<button role="tab" class="${k} ${Q.tab === k ? "on" : ""}" data-qt="${k}">${label}<span class="num">${c}</span></button>`;
    box.innerHTML = `
      <div class="mk-seg" role="tablist">${seg("all", "All", all.length)}${seg("pos", "▲ Positive", n("pos"))}${seg("neg", "▼ Negative", n("neg"))}</div>
      <div class="mk-bar"><span>News for <b>${esc(Q.q)}</b></span><button class="linkish" id="mk-clear">Back to market news</button></div>
      <div class="mk-list">${list.length ? list.slice(0, 40).map((x) => `<article class="mk-item">
          <a class="mk-h" href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a>
          <div class="mk-meta">${impactBadge(x.im)} ${esc(x.source)} · ${ago(x.ts)}</div></article>`).join("")
        : `<div class="empty">${all.length ? "None in this group." : `No news found for “${esc(Q.q)}” in the last year.`}</div>`}</div>`;
    box.querySelectorAll("[data-qt]").forEach((b) => b.addEventListener("click", () => { Q.tab = b.dataset.qt; draw(); }));
    document.getElementById("mk-clear").addEventListener("click", () => { const i = document.getElementById("mk-q"); if (i) i.value = ""; search(""); });
  }
  function wireSearch() {
    const form = document.getElementById("mk-search"), inp = document.getElementById("mk-q");
    if (!form || form.dataset.wired) return;
    form.dataset.wired = "1";
    if (Q.q) inp.value = Q.q;
    let t = 0;
    form.addEventListener("submit", (e) => { e.preventDefault(); clearTimeout(t); inp.blur(); search(inp.value); });
    inp.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => search(inp.value), 700); });
  }

  function draw() {
    const box = document.getElementById("market");
    if (!box) return;
    if (Q.q.length >= 2) { drawSearch(box); return; }
    const { esc, info } = window.SL;
    if (!M.data) {
      box.innerHTML = M.err ? `<div class="empty">Couldn't load market news: ${esc(M.err)} <button class="btn secondary" id="mk-retry">Try again</button></div>`
        : `<div class="loading-line"><span class="spinner"></span>Reading today's market and world headlines…</div>`;
      const r = document.getElementById("mk-retry");
      if (r) r.addEventListener("click", () => load(true));
      return;
    }
    const inTheme = M.data.items.filter((x) => M.theme === "all" || x.theme === M.theme);
    const pos = inTheme.filter((x) => x.im.dir === "pos"), neg = inTheme.filter((x) => x.im.dir === "neg"), none = inTheme.filter((x) => x.im.dir === "none");
    const list = M.tab === "pos" ? pos : M.tab === "neg" ? neg : none;
    const net = pos.length - neg.length;
    const mood = !pos.length && !neg.length ? "" : net >= 3 ? "Mostly positive" : net <= -3 ? "Mostly negative" : "Mixed";
    const seg = (k, label, n) => `<button role="tab" class="${k} ${M.tab === k ? "on" : ""}" data-mt="${k}" aria-selected="${M.tab === k}">${label}<span class="num">${n}</span></button>`;
    const shown = list.slice(0, M.more ? 60 : 12);
    box.innerHTML = `
      <div class="mk-seg" role="tablist">${seg("pos", "▲ Positive", pos.length)}${seg("neg", "▼ Negative", neg.length)}${seg("none", "Unclear", none.length)}</div>
      <div class="mk-bar">
        ${mood ? `<span class="mk-mood ${net >= 3 ? "pos" : net <= -3 ? "neg" : ""}"><b>${mood}</b> today</span>` : "<span></span>"}
        <span class="mk-upd">${M.loading ? '<span class="spinner"></span>' : `${ago(M.at / 1000)} ago`} · <button class="linkish" id="mk-refresh">Refresh</button></span>
      </div>
      <div class="hscroll mk-topics">${["all", ...M.data.themes].map((t) => `<button class="chip sm press ${M.theme === t ? "on" : ""}" data-mth="${esc(t)}">${t === "all" ? "All" : esc(t)}</button>`).join("")}</div>
      <div class="mk-list">${shown.length ? shown.map((x, i) => {
        const main = x.im.why.filter((w) => w.w).sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
        const words = x.im.why.map((w) => `${w.w > 0 ? "+" : w.w < 0 ? "−" : "·"}${Math.abs(w.w) || ""} ${w.label}`);
        return `<article class="mk-item">
          <a class="mk-h" href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a>
          ${main.length ? `<button class="mk-why ${x.im.dir}" data-wi="${i}" aria-expanded="false">${esc(main[0].text)}</button>
            <div class="mk-detail hidden" id="mkd-${i}">${x.im.sectors.length ? `<div><b>Who feels it:</b> ${esc(x.im.sectors[0])}</div>` : ""}
              <div class="faint">Decided by: ${esc(words.join(" · "))}. A word-rule hint, not a forecast.</div></div>` : ""}
          <div class="mk-meta">${esc(x.source)} · ${ago(x.ts)} · ${esc(x.theme)}</div></article>`;
      }).join("") : `<div class="empty">${M.tab === "none" ? "Every headline here leans one way." : `No ${M.tab === "pos" ? "positive" : "negative"} headlines in this topic right now.`}</div>`}</div>
      ${list.length > shown.length ? `<button class="w-more" id="mk-more">Show ${list.length - shown.length} more</button>` : ""}`;
    box.querySelectorAll("[data-mt]").forEach((b) => b.addEventListener("click", () => { M.tab = b.dataset.mt; M.more = false; draw(); }));
    box.querySelectorAll("[data-mth]").forEach((b) => b.addEventListener("click", () => { M.theme = b.dataset.mth; M.more = false; draw(); }));
    box.querySelectorAll("[data-wi]").forEach((b) => b.addEventListener("click", () => {
      const d = document.getElementById("mkd-" + b.dataset.wi), open = d.classList.toggle("hidden");
      b.setAttribute("aria-expanded", String(!open));
    }));
    const more = document.getElementById("mk-more");
    if (more) more.addEventListener("click", () => { M.more = true; draw(); });
    document.getElementById("mk-refresh").addEventListener("click", () => load(true));
  }

  window.MarketNews = { mount() { wireSearch(); draw(); load(false); }, judge };
})();
