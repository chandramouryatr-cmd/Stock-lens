/* Sectors: which NSE sectors are up or down (today, this week, this month), on the home page,
   and on each company page how the stock moved today against its sector and the Nifty 50. */
(function () {
  "use strict";
  const { esc, api } = window.SL;

  let data = null, at = 0, loading = null;
  async function load(force) {
    if (data && !force && Date.now() - at < 5 * 60 * 1000) return data;
    if (!loading) loading = api("/api/sectors").then((d) => { data = d; at = Date.now(); return d; }).finally(() => { loading = null; });
    return loading;
  }

  const pct = (v) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`);
  const tone = (v) => (v > 0 ? "up" : v < 0 ? "down" : "");

  /* ------------------------------------------------------------ home card: Markets */
  // One card, three views: Sectors (NSE sector indices), Commodities (world prices), F&O (India VIX).
  const H = { view: "sec", period: "day", all: false };
  let comm = null, commAt = 0, commErr = false;
  async function loadComm() {
    if (comm && Date.now() - commAt < 5 * 60 * 1000) return comm;
    comm = await api("/api/commodities"); commAt = Date.now(); return comm;
  }
  const money = (v, d) => (v == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d }));

  function barRow(name, sub, v, max, key) {
    const open = key && H.open === key;
    const tag = key ? `button type="button" class="sec-row tap${open ? " open" : ""}" data-sk="${key}" aria-expanded="${open}"` : `div class="sec-row"`;
    return `<${tag}><span class="sec-name">${key ? `<i class="sec-chev" aria-hidden="true">›</i>` : ""}${name}${sub ? `<small>${sub}</small>` : ""}</span>
      <span class="sec-bar"><i class="${tone(v)}" style="width:${(Math.abs(v || 0) / max) * 50}%;${(v || 0) >= 0 ? "left:50%" : "right:50%"}"></i></span>
      <b class="sec-pct ${tone(v)}">${pct(v)}</b></${key ? "button" : "div"}>${open ? stocksHtml(key) : ""}`;
  }

  // Tap a sector → its stocks (from NSE's official index list) with live price and today's change.
  const STOCKS = {}; // key -> { at, rows } | { loading } | { err }
  function stocksHtml(key) {
    const s = STOCKS[key];
    if (!s || s.loading) return `<div class="sec-stocks"><div class="loading-line"><span class="spinner"></span>Loading stocks…</div></div>`;
    if (s.err) return `<div class="sec-stocks"><p class="muted">Couldn't load this sector's stocks.</p></div>`;
    return `<div class="sec-stocks">${s.rows.map((r) => `<a class="ss-row" href="#/c${esc(r.path)}">
        <span class="ss-name">${esc(r.name.replace(/\s+Ltd\.?$/i, ""))}</span>
        <span class="ss-price">${r.price == null ? "—" : "₹" + money(r.price, r.price < 100 ? 2 : r.price < 1000 ? 1 : 0)}</span>
        <b class="ss-chg ${tone(r.change_pct)}">${pct(r.change_pct)}</b></a>`).join("")}
      <div class="ss-note">${s.rows.length} stocks in this NSE index · best today first · tap one to open it</div></div>`;
  }
  async function loadStocks(key, box) {
    const s = STOCKS[key];
    if (s && !s.err && (s.loading || Date.now() - s.at < 2 * 60 * 1000)) return;
    STOCKS[key] = { loading: true };
    try { STOCKS[key] = { at: Date.now(), rows: await api("/api/sector-stocks", { key }) }; }
    catch (e) { STOCKS[key] = { err: true }; }
    if (H.open === key) draw(box);
  }

  function viewSectors(p) {
    if (!data) return `<div class="loading-line"><span class="spinner"></span>Loading sectors…</div>`;
    const nifty = data.find((s) => s.key === "nifty");
    const list = data.filter((s) => s.key !== "nifty" && s[p] != null).sort((a, b) => b[p] - a[p]);
    const max = Math.max(1, ...list.map((s) => Math.abs(s[p])));
    const shown = H.all || list.length <= 6 ? list : [...list.slice(0, 3), null, ...list.slice(-3)];
    return `${nifty ? `<div class="sec-bench">Nifty 50 <b class="${tone(nifty[p])}">${pct(nifty[p])}</b></div>` : ""}
      <div class="sec-list">${shown.map((s) => (s ? barRow(esc(s.name), "", s[p], max, s.key) : `<div class="sec-gap">···</div>`)).join("")}</div>
      ${list.length > 6 ? `<button class="w-more" data-sall>${H.all ? "Show less" : `Show all ${list.length} sectors`}</button>` : ""}`;
  }

  function viewComm(p) {
    if (commErr) return `<p class="muted">Couldn't load commodity prices right now.</p>`;
    if (!comm) return `<div class="loading-line"><span class="spinner"></span>Loading commodities…</div>`;
    const items = comm.items.filter((x) => x[p] != null);
    const max = Math.max(1, ...items.map((x) => Math.abs(x[p])));
    return `<div class="sec-list">${items.map((x) => {
      const price = x.inr ? `₹${money(x.inr.value, 0)} <span>${esc(x.inr.unit)}*</span>` : `${x.unit.startsWith("₹") ? "₹" : "$"}${money(x.price, x.price < 10 ? 2 : x.price < 1000 ? 2 : 0)} <span>${esc(x.unit.replace(/^\$\//, "per ").replace(/^₹ per \$/, "per $"))}</span>`;
      return barRow(esc(x.name), price, x[p], max);
    }).join("")}</div>
      <p class="sec-note">World futures prices. *Gold and silver in rupees are rough: before import duty and GST, so below Indian shop and MCX prices.</p>`;
  }

  function viewFno(p) {
    if (commErr) return `<p class="muted">Couldn't load India VIX right now.</p>`;
    if (!comm) return `<div class="loading-line"><span class="spinner"></span>Loading…</div>`;
    const v = comm.vix;
    if (!v) return `<p class="muted">India VIX isn't available right now.</p>`;
    const lvl = v.price < 13 ? ["Calm", "up"] : v.price <= 20 ? ["Normal", ""] : v.price <= 25 ? ["Nervous", "down"] : ["Fearful", "down"];
    return `<div class="vix">
        <div><div class="vix-k">India VIX ${SL.info("india vix")}</div><div class="vix-v">${v.price.toFixed(2)}</div></div>
        <div class="vix-r"><b class="${lvl[1]}">${lvl[0]}</b><span class="${tone(-(v[p] || 0))}">${pct(v[p])} ${p === "day" ? "today" : p === "week" ? "this week" : "this month"}</span></div>
      </div>
      <div class="vix-scale"><span>Calm &lt;13</span><span>Normal 13–20</span><span>Nervous 20–25</span><span>Fearful &gt;25</span>
        <i style="left:${Math.min(98, Math.max(2, ((v.price - 8) / (32 - 8)) * 100))}%"></i></div>
      <p class="sec-note">VIX comes from Nifty option prices: it shows how big a move traders expect over the next month. Rising VIX usually means falling, jumpy markets.
        Option chain, open interest and futures data come only from NSE, which blocks free automated access. <a href="https://www.nseindia.com/option-chain" target="_blank" rel="noopener">Open NSE option chain</a></p>`;
  }

  function draw(box) {
    if (!document.body.contains(box)) return;
    const p = H.period;
    const tab = (k, l) => `<button role="tab" class="${H.view === k ? "on" : ""}" data-sv="${k}" aria-selected="${H.view === k}">${l}</button>`;
    const seg = (k, l) => `<button class="${p === k ? "on" : ""}" data-sp="${k}">${l}</button>`;
    box.innerHTML = `
      <div class="card-head mk-head"><h2>Markets</h2>
        <div class="w-sort sec-seg" role="group" aria-label="Period">${seg("day", "Today")}${seg("week", "Week")}${seg("month", "Month")}</div></div>
      <div class="sec-tabs" role="tablist">${tab("sec", "Sectors")}${tab("com", "Commodities")}${tab("fno", "F&amp;O")}</div>
      ${H.view === "sec" ? viewSectors(p) : H.view === "com" ? viewComm(p) : viewFno(p)}`;
    box.querySelectorAll("[data-sp]").forEach((b) => b.addEventListener("click", () => { H.period = b.dataset.sp; draw(box); }));
    box.querySelectorAll("[data-sv]").forEach((b) => b.addEventListener("click", () => { H.view = b.dataset.sv; draw(box); }));
    const all = box.querySelector("[data-sall]"); if (all) all.addEventListener("click", () => { H.all = !H.all; draw(box); });
    box.querySelectorAll("[data-sk]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.sk;
      H.open = H.open === k ? null : k;
      draw(box);
      if (H.open) loadStocks(k, box);
    }));
  }
  async function mount(box) {
    draw(box);
    load().then(() => draw(box)).catch(() => {});
    loadComm().then(() => draw(box)).catch(() => { commErr = true; draw(box); });
  }

  /* ------------------------------------------------------------ company page */
  // Screener's industry names → the NSE sector index that best matches.
  const RULES = [
    [/public sector bank/i, "psubank"], [/bank/i, "bank"],
    [/nbfc|non banking|financ|insurance|asset management|broking|capital market|housing finance|exchange/i, "fin"],
    [/software|it -|it services|computers|information technology|internet/i, "it"],
    [/pharma|drug|health|hospital|diagnostic|medical|biotech/i, "pharma"],
    [/auto|vehicle|wheeler|tyre|tractor/i, "auto"],
    [/fmcg|food|beverage|personal care|tobacco|cigarette|dairy|tea|edible|household/i, "fmcg"],
    [/metal|steel|alumin|iron|copper|zinc|mining|minerals/i, "metal"],
    [/realty|real estate|residential|commercial projects/i, "realty"],
    [/oil|gas|refiner|petroleum|power|electric|energy|coal|renewable/i, "energy"],
    [/construction|cement|infrastructure|engineering|capital goods|ports|road|railway|airport|telecom/i, "infra"],
    [/retail|consumer|durable|apparel|textile|hotel|restaurant|jewel|footwear|media|entertainment/i, "consum"],
  ];
  function keyFor(c) {
    const text = (c.sector || []).map((s) => s.name).join(" | ") + " | " + (c.name || "");
    for (const [rx, k] of RULES) if (rx.test(text)) return k;
    return null;
  }

  async function companyLine(c, sym) {
    const box = document.getElementById("sector-line");
    if (!box) return;
    const key = keyFor(c);
    let d, q = null;
    try {
      [d, q] = await Promise.all([load(), sym ? api("/api/quote", { symbols: sym }).then((r) => r[sym]).catch(() => null) : null]);
    } catch (e) { return; }
    if (!document.body.contains(box)) return;
    const sec = key && d.find((s) => s.key === key), nifty = d.find((s) => s.key === "nifty");
    const chip = (label, v) => `<span class="sl-chip"><span>${esc(label)}</span><b class="${tone(v)}">${pct(v)}</b></span>`;
    const parts = [];
    if (q && q.change_pct != null) parts.push(chip("Today", q.change_pct));
    if (sec) parts.push(chip(sec.name + " sector", sec.day));
    if (nifty) parts.push(chip("Nifty 50", nifty.day));
    let verdict = "";
    if (q && q.change_pct != null && sec) {
      const gap = q.change_pct - sec.day;
      verdict = Math.abs(gap) < 0.25 ? "Moving with its sector" : gap > 0 ? "Doing better than its sector today" : "Doing worse than its sector today";
    }
    box.innerHTML = parts.length ? `<div class="sl-chips">${parts.join("")}</div>${verdict ? `<div class="sl-verdict">${verdict}</div>` : ""}` : "";
  }

  // Markets page (#/markets): sectors, commodities and F&O on a page of their own.
  window.SL.PAGES["/markets"] = (view) => {
    document.title = "Markets · Stock Lens";
    H.all = true; // the page has room for every sector
    view.innerHTML = `<div class="page-narrow"><section class="card fade-in markets-page" id="markets-page"></section></div>`;
    mount(document.getElementById("markets-page"));
  };

  window.Sectors = { mount, companyLine, keyFor, load };
})();
