/* Stock Lens — main app */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tc = (s) => Risk.titleCase(s);
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const inr = (v, d = 0) => (v == null ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: d }));
  const ago = (ts) => {
    const s = Date.now() / 1000 - ts;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m";
    if (s < 86400) return Math.round(s / 3600) + "h";
    if (s < 86400 * 30) return Math.round(s / 86400) + "d";
    return new Date(ts * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };
  const shortName = (n) => String(n || "").replace(/\s+(ltd\.?|limited|pvt\.?|private limited)$/i, "").trim();
  const norm = (n) => String(n || "").toUpperCase().replace(/&/g, " AND ")
    .replace(/\b(LTD|LIMITED|PVT|PRIVATE|THE)\b\.?/g, " ").replace(/[^A-Z0-9]/g, "");
  const isKey = (d) => /managing|ceo|whole|executive|chief|cfo/i.test(d || "");
  const initials = (n) => tc(n).split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("");

  async function api(path, params = {}) {
    const u = new URL(path, location.origin);
    for (const k in params) if (params[k] != null) u.searchParams.set(k, params[k]);
    const r = await fetch(u);
    const j = await r.json().catch(() => ({ error: "Bad response" }));
    if (!r.ok) throw new Error(j.error || "Request failed (" + r.status + ")");
    return j;
  }

  const ICON = {
    high: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3l10 18H2z" stroke-linejoin="round"/><path d="M12 10v4M12 17.5v.01"/></svg>',
    medium: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>',
    low: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>',
    good: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    ext: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>',
  };
  const LEVEL_LABEL = { high: "High", medium: "Medium", low: "Low", info: "Note", good: "Strength", positive: "Positive" };
  const badge = (level, text) => `<span class="badge ${level === "good" ? "good" : level}">${ICON[level === "positive" ? "good" : level] || ""}${esc(text || LEVEL_LABEL[level])}</span>`;
  const sevName = (n) => ({ 3: "high", 2: "medium", 1: "low" }[n]);

  /* Small "i" button: plain-English meaning of a technical term (see glossary.js). */
  const info = (key) => {
    const k = String(key || "").toLowerCase(), g = Glossary[k];
    return g ? `<button type="button" class="i-btn" data-i="${esc(k)}" aria-label="What does ${esc(g[0])} mean?">i</button>` : "";
  };
  const ipop = $("#ipop");
  let ipopFor = null;
  function hideInfo() { ipop.classList.add("hidden"); ipopFor = null; }
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-i]");
    if (!b) { if (!e.target.closest || !e.target.closest("#ipop")) hideInfo(); return; }
    e.preventDefault(); e.stopPropagation();
    if (ipopFor === b) return hideInfo();
    const g = Glossary[b.dataset.i];
    ipop.innerHTML = `<b>${esc(g[0])}</b><p>${esc(g[1])}</p>`;
    ipop.classList.remove("hidden");
    const r = b.getBoundingClientRect(), w = ipop.offsetWidth, h = ipop.offsetHeight;
    ipop.style.left = Math.max(12, Math.min(document.documentElement.clientWidth - w - 12, r.left + r.width / 2 - w / 2)) + "px";
    ipop.style.top = (r.bottom + 8 + h > innerHeight && r.top - h - 8 > 0 ? r.top - h - 8 : r.bottom + 8) + "px";
    ipopFor = b;
  }, true);
  addEventListener("scroll", hideInfo, { passive: true });
  addEventListener("keydown", (e) => { if (e.key === "Escape") hideInfo(); });

  /* Price maths used by the Price tab and Compare. points: [[unixSec, close]] */
  const Tech = {
    sma(v, n) { const out = []; let s = 0; for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; out.push(i >= n - 1 ? s / n : null); } return out; },
    ret(pts, days) {
      if (!pts || pts.length < 2) return null;
      const last = pts[pts.length - 1], target = last[0] - days * 86400;
      if (pts[0][0] > target + 10 * 86400) return null;
      let base = pts[0];
      for (const p of pts) { if (p[0] <= target) base = p; else break; }
      return (last[1] / base[1] - 1) * 100;
    },
    rsi(v, n = 14) {
      if (v.length <= n) return null;
      let g = 0, l = 0;
      for (let i = 1; i <= n; i++) { const d = v[i] - v[i - 1]; if (d > 0) g += d; else l -= d; }
      g /= n; l /= n;
      for (let i = n + 1; i < v.length; i++) { const d = v[i] - v[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; }
      return l === 0 ? 100 : 100 - 100 / (1 + g / l);
    },
    drawdown(v) { let peak = -Infinity, dd = 0; for (const x of v) { peak = Math.max(peak, x); dd = Math.min(dd, x / peak - 1); } return dd * 100; },
    vol(v) {
      if (v.length < 30) return null;
      const r = []; for (let i = 1; i < v.length; i++) r.push(Math.log(v[i] / v[i - 1]));
      const m = r.reduce((a, b) => a + b, 0) / r.length;
      return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(252) * 100;
    },
    lastYear(pts) { const cut = pts[pts.length - 1][0] - 365 * 86400; return pts.filter((p) => p[0] >= cut); },
  };
  const signed = (v, d = 1) => (v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(d) + "%");
  const tone = (v) => (v == null ? "" : v > 0 ? "tone-good" : v < 0 ? "tone-high" : "");

  /* ------------------------------------------------------------------
     Spring (Apple: damping ratio + response). Interruptible: always
     continues from the current value and carries velocity.
  ------------------------------------------------------------------ */
  function spring(apply, init = 0) {
    const s = { x: init, v: 0, target: init, raf: 0, response: 0.35, damping: 1 };
    let last = 0;
    const step = (t) => {
      const dt = Math.min(0.032, (t - last) / 1000 || 0.016);
      last = t;
      const k = (2 * Math.PI / s.response) ** 2, c = (4 * Math.PI * s.damping) / s.response;
      s.v += (-k * (s.x - s.target) - c * s.v) * dt;
      s.x += s.v * dt;
      if (Math.abs(s.v) < 5 && Math.abs(s.x - s.target) < 0.3) { s.x = s.target; s.v = 0; s.raf = 0; apply(s.x); return; }
      apply(s.x);
      s.raf = requestAnimationFrame(step);
    };
    s.to = (target, o = {}) => {
      s.target = target;
      if (o.response) s.response = o.response;
      if (o.damping != null) s.damping = o.damping;
      if (o.velocity != null) s.v = o.velocity;
      if (reduced()) { cancelAnimationFrame(s.raf); s.raf = 0; s.x = target; s.v = 0; apply(target); return; }
      if (!s.raf) { last = performance.now(); s.raf = requestAnimationFrame(step); }
    };
    s.set = (x) => { cancelAnimationFrame(s.raf); s.raf = 0; s.x = s.target = x; s.v = 0; apply(x); };
    return s;
  }
  // Apple's momentum projection (Designing Fluid Interfaces)
  const project = (v, rate = 0.998) => ((v / 1000) * rate) / (1 - rate);
  const rubber = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

  /* ------------------------------------------------------------------ State */
  const S = { path: null, company: null, people: null, peopleErr: null, price: null, news: {}, tab: "overview", token: 0, newsFilter: "all", flaggedOnly: false, cy: null, net: { owners: true, related: true, peers: true, people: true, links: true, allLinks: false } };
  const TABS = [
    ["overview", "Overview"], ["price", "Price & valuation"], ["network", "Network"], ["people", "People"],
    ["owners", "Owners & dealings"], ["news", "News"], ["risks", "Risks"],
  ];

  /* ------------------------------------------------------------------ Theme */
  const root = document.documentElement;
  try { const t = localStorage.getItem("sl-theme"); if (t) root.dataset.theme = t; } catch (e) {}
  $("#theme").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("sl-theme", root.dataset.theme); } catch (e) {}
    if (S.cy) styleGraph();
  });
  addEventListener("scroll", () => $("#toolbar").classList.toggle("scrolled", scrollY > 4), { passive: true });

  /* ------------------------------------------------------------------ Search */
  const q = $("#q"), results = $("#results");
  let sel = -1, items = [], timer = 0, qTok = 0;
  function showResults(list) {
    items = list; sel = list.length ? 0 : -1;
    results.innerHTML = list.length
      ? list.map((r, i) => `<button role="option" aria-selected="${i === sel}" data-i="${i}"><span>${esc(r.name)}</span><span class="path">${esc(r.path.split("/")[2])}</span></button>`).join("")
      : `<div class="empty" style="padding:14px">No listed company matches</div>`;
    results.classList.remove("hidden");
    $("#search").setAttribute("aria-expanded", "true");
  }
  function hideResults() { results.classList.add("hidden"); $("#search").setAttribute("aria-expanded", "false"); }
  q.addEventListener("input", () => {
    clearTimeout(timer);
    const v = q.value.trim();
    $("#kbd").classList.toggle("hidden", !!v);
    if (v.length < 2) return hideResults();
    timer = setTimeout(async () => {
      const t = ++qTok;
      try { const r = await api("/api/search", { q: v }); if (t === qTok) showResults(r); } catch (e) {}
    }, 120);
  });
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      $$("button", results).forEach((b, i) => b.setAttribute("aria-selected", i === sel));
    } else if (e.key === "Enter" && items[sel]) { go(items[sel].path); }
    else if (e.key === "Escape") { hideResults(); q.blur(); }
  });
  results.addEventListener("pointerdown", (e) => { const b = e.target.closest("button[data-i]"); if (b) { e.preventDefault(); go(items[+b.dataset.i].path); } });
  q.addEventListener("blur", () => setTimeout(hideResults, 120));
  addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== q && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
    if (e.key === "Escape") closeSheet();
  });
  function go(path) { hideResults(); q.value = ""; $("#kbd").classList.remove("hidden"); q.blur(); location.hash = "#/c" + path; }
  $("#home").addEventListener("click", () => { location.hash = ""; });

  /* Extra pages, tabs and hooks registered by pro.js */
  const PAGES = {}, XTABS = {}, HOOKS = {};

  /* ------------------------------------------------------------------ Router */
  addEventListener("hashchange", route);
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    closeSheet();
    hideInfo();
    if (h.startsWith("/c/company/")) {
      const path = h.slice(2);
      if (path !== S.path) loadCompany(path);
    } else if (h === "/compare") { S.path = null; S.token++; comparePage(); }
    else if (PAGES[h]) { S.path = null; S.token++; if (S.cy) { S.cy.destroy(); S.cy = null; } scrollTo({ top: 0 }); PAGES[h]($("#view")); }
    else { S.path = null; S.token++; home(); }
  }

  /* ------------------------------------------------------------------ Home */
  const EXAMPLES = [
    ["TCS", "/company/TCS/consolidated/"], ["Reliance Industries", "/company/RELIANCE/consolidated/"],
    ["HDFC Bank", "/company/HDFCBANK/consolidated/"], ["Adani Enterprises", "/company/ADANIENT/consolidated/"],
    ["Vedanta", "/company/VEDL/consolidated/"], ["Yes Bank", "/company/YESBANK/consolidated/"],
  ];
  /* Saved lists (this browser only) */
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const watched = (path) => store.get("sl-watch").some((w) => w.path === path);
  function toggleWatch(name, path) {
    const list = store.get("sl-watch");
    store.set("sl-watch", watched(path) ? list.filter((w) => w.path !== path) : [{ name, path }, ...list]);
  }
  function remember(name, path) {
    store.set("sl-recent", [{ name, path }, ...store.get("sl-recent").filter((r) => r.path !== path)].slice(0, 6));
  }
  const STAR = (on) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/></svg>`;
  const STATUS_ICON = { pass: "good", watch: "medium", fail: "high", na: "low" };
  const scoreBar = (sc) => `<span class="scorebar" aria-hidden="true">${sc.checks.map((x) => `<i class="${x.status}" title="${esc(x.label)}: ${esc(x.value)}"></i>`).join("")}</span>`;

  /* Screen: well-known NSE companies, each run through the same health check. */
  const UNIVERSE = ("TCS INFY HCLTECH WIPRO TECHM RELIANCE ONGC COALINDIA NTPC POWERGRID HDFCBANK ICICIBANK SBIN KOTAKBANK AXISBANK BAJFINANCE " +
    "ITC HINDUNILVR NESTLEIND ASIANPAINT PIDILITIND TITAN TRENT DMART MARUTI M&M BAJAJ-AUTO EICHERMOT LT ULTRACEMCO TATASTEEL JSWSTEEL " +
    "ADANIPORTS HAL BEL SUNPHARMA DRREDDY CIPLA DIVISLAB BHARTIARTL").split(" ").map((s) => `/company/${s}/consolidated/`);
  const SCR = { rows: new Map(), queue: [], active: 0, sort: "score", dir: -1, filter: "all", listeners: [] };
  function screenAdd(paths) {
    for (const p of paths) if (!SCR.rows.has(p)) { SCR.rows.set(p, { path: p, name: p.split("/")[2], state: "loading" }); SCR.queue.push(p); }
    while (SCR.active < 3 && SCR.queue.length) screenNext();
  }
  async function screenNext() {
    const p = SCR.queue.shift();
    SCR.active++;
    const row = SCR.rows.get(p);
    try {
      const c = await api("/api/company", { path: p, light: 1 });
      const ind = (c.sector || []).find((s) => s.level === "Industry") || (c.sector || []).slice(-1)[0];
      let c2 = c, sc = Score.compute(c);
      // Some companies have no group accounts: the consolidated page is then empty, so read the standalone one.
      if (sc.m.s5 == null && sc.m.p5 == null && sc.m.ret == null && /\/consolidated\/$/.test(p)) {
        try { c2 = await api("/api/company", { path: p.replace("consolidated/", ""), light: 1 }); sc = Score.compute(c2); } catch (e) { c2 = c; }
      }
      const ind2 = (c2.sector || []).find((s) => s.level === "Industry") || (c2.sector || []).slice(-1)[0] || ind;
      const a = (c2.announcements || [])[0];
      Object.assign(row, { state: "ok", name: shortName(c2.name), go: c2.path, industry: ind2 ? ind2.name : "", score: sc, trend: Score.trend(c2),
        ann: a ? { title: a.title, date: a.date } : null, quarter: c2.tables && c2.tables.quarters ? c2.tables.quarters.headers.slice(-1)[0] : null });
    } catch (e) {
      // One more try at the end of the queue (the source may just have been busy), then give up.
      row.tries = (row.tries || 0) + 1;
      if (row.tries < 2 && !/404/.test(e.message)) SCR.queue.push(p); else row.state = "err";
    }
    SCR.active--;
    if (SCR.queue.length) screenNext();
    renderScreen();
  }
  const SCR_COLS = [["score", "Checks passed", "health check"], ["ret", "ROCE / ROE %", "roce"], ["s5", "Sales 5y %", "cagr"], ["p5", "Profit 5y %", "cagr"], ["de", "Debt / equity", "debt to equity"], ["pe", "P/E", "stock p/e"], ["mcap", "Mcap ₹ Cr", "market cap"]];
  function renderScreen() {
    SCR.listeners.forEach((fn) => fn());
    const box = $("#screen");
    if (!box) return;
    const homeSet = new Set([...UNIVERSE, ...store.get("sl-watch").map((w) => w.path)]);
    const all = [...SCR.rows.values()].filter((r) => homeSet.has(r.path));
    const done = all.filter((r) => r.state !== "loading").length;
    let rows = all.filter((r) => r.state === "ok");
    if (SCR.filter === "watch") rows = rows.filter((r) => watched(r.path));
    if (SCR.filter === "top") rows = rows.filter((r) => r.score.share >= 0.75 && !r.score.failed);
    const val = (r) => (SCR.sort === "score" ? r.score.share + r.score.passed / 100 - r.score.failed / 1000 : r.score.m[SCR.sort]);
    rows.sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null || y == null) return (x == null) - (y == null);
      return (x - y) * SCR.dir || (b.score.m.ret || 0) - (a.score.m.ret || 0);
    });
    const chip = (k, label) => `<button class="chip press ${SCR.filter === k ? "on" : ""}" data-sf="${k}">${label}</button>`;
    const n = (v, d) => (v == null ? "—" : inr(v, d));
    box.innerHTML = `
      <div class="filters">${chip("all", "All " + all.length)}${chip("top", "Passing 75%+, no fails")}${chip("watch", "My watchlist")}
        ${done < all.length ? `<span class="loading-line"><span class="spinner"></span>Checked ${done} of ${all.length}…</span>` : ""}</div>
      <div class="scroll-x"><table class="t screen-t"><thead><tr><th>Company</th>${SCR_COLS.map(([k, l, g]) => `<th><button class="th-sort ${SCR.sort === k ? "on" : ""}" data-sort="${k}">${l}${SCR.sort === k ? (SCR.dir < 0 ? " ↓" : " ↑") : ""}</button>${info(g)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => {
        const s = r.score, m = s.m;
        return `<tr data-go="${esc(r.go || r.path)}" tabindex="0"><td><div class="co-cell"><b>${esc(r.name)}</b><span class="faint">${esc(r.industry || "")}</span></div></td>
          <td><span class="score-cell">${scoreBar(s)}<b class="tone-${s.tone}">${s.passed}/${s.total}</b></span></td>
          <td>${n(m.ret, 1)}</td><td>${n(m.s5)}</td><td>${n(m.p5)}</td><td>${s.isFin ? '<span class="faint">n/a</span>' : n(m.de, 2)}</td><td>${n(m.pe, 1)}</td><td>${n(m.mcap)}</td></tr>`;
      }).join("") || `<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">${done < all.length ? "Reading companies…" : SCR.filter === "watch" ? "Nothing starred yet. Open a company and tap the star." : "No company matches this filter."}</td></tr>`}</tbody></table></div>`;
    $$("[data-sf]", box).forEach((b) => b.addEventListener("click", () => { SCR.filter = b.dataset.sf; renderScreen(); }));
    $$("[data-sort]", box).forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.sort;
      if (SCR.sort === k) SCR.dir = -SCR.dir; else { SCR.sort = k; SCR.dir = k === "de" || k === "pe" ? 1 : -1; }
      renderScreen();
    }));
    $$("tr[data-go]", box).forEach((tr) => {
      tr.addEventListener("click", () => go(tr.dataset.go));
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") go(tr.dataset.go); });
    });
  }

  function home() {
    document.title = "Stock Lens";
    if (S.cy) { S.cy.destroy(); S.cy = null; }
    const watch = store.get("sl-watch"), recent = store.get("sl-recent");
    const chipRow = (title, list) => `<div class="chip-group"><span class="faint">${title}</span>${list.map((x) => `<button class="chip press" data-go="${esc(x.path)}">${esc(shortName(x.name))}</button>`).join("")}</div>`;
    $("#view").innerHTML = `
      <section class="hero fade-in">
        <h1 class="display">See the whole company.<br>And everyone around it.</h1>
        <p class="lede">Owners, directors, the businesses they're tied to, what the news is saying and where the risks are — for any Indian listed stock, from free public data.</p>
        <div class="hero-btns"><button class="btn hero-search press" id="hero-search">Search a stock <span class="kbd-inline">/</span></button>
          <a class="btn secondary hero-search" href="#/screener">Screener</a>
          <a class="btn secondary hero-search" href="#/portfolio">Portfolio</a>
          <a class="btn secondary hero-search" href="#/compare">Compare</a></div>
        <div class="chip-groups">
          ${watch.length ? chipRow("Watchlist", watch) : ""}
          ${recent.length ? chipRow("Recent", recent) : ""}
          ${!watch.length && !recent.length ? chipRow("Try", EXAMPLES.map(([name, path]) => ({ name, path }))) : ""}
        </div>
      </section>
      <div id="changes"></div>
      <section class="card fade-in">
        <h2>Health-check screen</h2>
        <p class="sub">${UNIVERSE.length} well-known NSE companies plus your watchlist, each run through the same 8 plain checks: returns, growth, debt, cash, promoter stake, latest quarter and price. Green = pass, amber = watch, red = fail, grey = does not apply. A list of places to start reading — not advice to buy or sell.</p>
        <div id="screen"></div>
      </section>
      <section class="how">
        ${[
          ["--n-holder", "Owners & dealings", "Named shareholders, how their stakes moved, and the related parties the company transacts with."],
          ["--n-person", "People", "Every director and key manager, their tenure, and every other board they sit on."],
          ["--n-company", "Network", "One map that links the company, its owners, people, group firms and peers."],
          ["--high", "News & risks", "Headlines for the company and its people, auto-flagged, plus rule-based checks with the evidence shown."],
        ].map(([c, t, d]) => `<div class="card"><span class="dot" style="background:var(${c})"></span><h3>${t}</h3><p>${d}</p></div>`).join("")}
      </section>`;
    $$(".hero [data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
    $("#hero-search").addEventListener("click", () => q.focus());
    screenAdd([...UNIVERSE, ...watch.map((w) => w.path)]);
    renderScreen();
    if (HOOKS.home) HOOKS.home();
  }

  /* ------------------------------------------------------------------ Company */
  async function loadCompany(path) {
    const tok = ++S.token;
    Object.assign(S, { path, company: null, people: null, peopleErr: null, price: null, priceDone: false, nifty: null, val: null, news: {}, newsFilter: "all", flaggedOnly: false, rpAll: false });
    if (S.cy) { S.cy.destroy(); S.cy = null; }
    scrollTo({ top: 0 });
    $("#view").innerHTML = `
      <div class="co-head"><div style="flex:1">
        <div class="skel" style="width:180px;height:14px;margin-bottom:12px"></div>
        <div class="skel" style="width:min(420px,80%);height:38px"></div></div></div>
      <div class="loading-line"><span class="spinner"></span>Reading financials, owners and peers…</div>`;
    let c;
    try { c = await api("/api/company", { path }); }
    catch (e) {
      if (tok !== S.token) return;
      $("#view").innerHTML = `<div class="empty"><p class="err">Couldn't load this company: ${esc(e.message)}</p><button class="btn" onclick="location.reload()">Try again</button></div>`;
      return;
    }
    if (tok !== S.token) return;
    S.company = c;
    S.score = Score.compute(c);
    remember(c.name, path);
    document.title = shortName(c.name) + " · Stock Lens";
    renderShell();
    loadPrice(tok);
    loadPeople(tok);
    loadNews(tok, { key: "company", label: shortName(c.name), q: `"${shortName(c.name)}"`, kind: "company" });
    loadNews(tok, { key: "scan:company", label: shortName(c.name) + " · risk scan", q: `"${shortName(c.name)}"`, kind: "company", scan: true });
  }

  async function loadPrice(tok) {
    const c = S.company;
    const sym = c.nse_symbol ? c.nse_symbol + ".NS" : c.bse_code ? c.bse_code + ".BO" : null;
    // Valuation history and the Nifty 50 load alongside; each refreshes the Price tab when it lands.
    if (c.id) api("/api/valuation", { id: c.id, consolidated: c.consolidated ? 1 : 0 }).then((v) => { if (tok === S.token) { S.val = v; refresh(["price"]); } }).catch(() => {});
    api("/api/price", { symbol: "^NSEI", range: "5y" }).then((n) => { if (tok === S.token) { S.nifty = n; refresh(["price"]); } }).catch(() => {});
    try {
      if (sym) {
        const p = await api("/api/price", { symbol: sym, range: "5y" });
        if (tok !== S.token) return;
        if (p.points.length > 1) { S.price = p; renderPrice(); }
      }
    } catch (e) {}
    if (tok !== S.token) return;
    S.priceDone = true;
    refresh(["price"]);
  }

  async function loadPeople(tok) {
    try {
      const p = await api("/api/people", { name: S.company.name });
      if (tok !== S.token) return;
      S.people = p;
    } catch (e) {
      if (tok !== S.token) return;
      S.peopleErr = e.message;
    }
    refresh(["people", "network", "risks"]);
    // News for the people who run it and the biggest non-institutional owners.
    const jobs = [];
    const dirs = (S.people && S.people.directors) || [];
    const ranked = [...dirs].sort((a, b) => isKey(b.designation) - isKey(a.designation)).slice(0, 5);
    ranked.forEach((d, i) => {
      const words = tc(d.name).split(" ");
      const qq = words.length > 2 ? `"${tc(d.name)}" OR "${words[0]} ${words[words.length - 1]}"` : `"${tc(d.name)}"`;
      jobs.push({ key: "p:" + d.din, label: tc(d.name), q: qq, kind: "person" });
      if (i < 2) jobs.push({ key: "scan:p:" + d.din, label: tc(d.name) + " · risk scan", q: qq, kind: "person", scan: true });
    });
    const self = norm(S.company.name);
    (S.company.holders || []).filter((h) => h.category === "Promoters" && (h.latest || 0) >= 1 && norm(h.name) !== self && h.name.length <= 60)
      .slice(0, 2).forEach((h) => jobs.push({ key: "h:" + h.name, label: shortName(h.name), q: `"${shortName(h.name)}"`, kind: "owner" }));
    for (let i = 0; i < jobs.length; i += 3) await Promise.all(jobs.slice(i, i + 3).map((j) => loadNews(tok, j)));
  }

  async function loadNews(tok, job) {
    S.news[job.key] = { ...job, loading: true, items: [] };
    try {
      const items = await api("/api/news", { q: job.q, scan: job.scan ? 1 : null });
      if (tok !== S.token) return;
      S.news[job.key] = { ...job, items };
    } catch (e) {
      if (tok !== S.token) return;
      S.news[job.key] = { ...job, items: [], error: e.message };
    }
    refresh(["news", "risks"]);
  }

  function refresh(tabs) {
    updateCounts();
    if (tabs.includes(S.tab)) renderTab(true);
  }

  /* ------------------------------------------------------------------ Shell + tabs */
  function ratio(name) { return (S.company.ratios || []).find((r) => r.name === name); }

  function renderShell() {
    const c = S.company;
    const ind = (c.sector || []).find((s) => s.level === "Industry") || c.sector[c.sector.length - 1];
    $("#view").innerHTML = `
      <div class="co-head fade-in">
        <div style="flex:1;min-width:260px">
          <div class="eyebrow">
            ${c.nse_symbol ? `<span class="pill">NSE: ${esc(c.nse_symbol)}</span>` : ""}
            ${c.bse_code ? `<span class="pill">BSE: ${esc(c.bse_code)}</span>` : ""}
            ${ind ? `<span>${esc(ind.name)}</span>` : ""}
            <span class="faint">· ${c.consolidated ? "Consolidated" : "Standalone"} figures${info(c.consolidated ? "consolidated" : "standalone")}</span>
          </div>
          <h1>${esc(c.name)}</h1>
          <div class="head-actions">
            <button class="btn secondary press" id="watch" aria-pressed="${watched(c.path)}">${STAR(watched(c.path))}<span>${watched(c.path) ? "In watchlist" : "Add to watchlist"}</span></button>
            <button class="btn secondary press" id="cmp-go">Compare</button>
            <span class="score-chip tone-${S.score.tone}">${scoreBar(S.score)}<b>${S.score.passed} of ${S.score.total}</b> checks passed</span>
          </div>
        </div>
        <div class="price-box" id="price-box">
          <div class="price num">${esc(ratio("Current Price")?.value || "")}</div>
          <div class="delta faint" id="delta">Market cap ${esc(ratio("Market Cap")?.value || "—")}</div>
          <div id="spark"></div>
        </div>
      </div>
      <div class="seg-wrap"><div class="seg" role="tablist" id="seg">
        <span class="thumb" id="thumb"></span>
        ${TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === S.tab}">${l}<span class="count" data-count="${k}"></span></button>`).join("")}
      </div></div>
      <div id="tab"></div>`;
    const thumbX = spring((x) => ($("#thumb").style.transform = `translateX(${x}px)`));
    const thumbW = spring((w) => ($("#thumb").style.width = w + "px"));
    const place = (instant) => {
      const b = $(`#seg button[data-tab="${S.tab}"]`);
      if (!b) return;
      const x = b.offsetLeft, w = b.offsetWidth;
      if (instant) { thumbX.set(x); thumbW.set(w); } else { thumbX.to(x, { response: 0.3 }); thumbW.to(w, { response: 0.3 }); }
      b.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    $$("#seg button").forEach((b) => b.addEventListener("pointerdown", () => {
      if (S.tab === b.dataset.tab) return;
      S.tab = b.dataset.tab;
      $$("#seg button").forEach((x) => x.setAttribute("aria-selected", x === b));
      place(false);
      renderTab(false);
      const top = $("#tab").getBoundingClientRect().top + scrollY - 120;
      if (scrollY > top) scrollTo({ top, behavior: reduced() ? "auto" : "smooth" });
    }));
    $("#seg").addEventListener("keydown", (e) => {
      if (!/Arrow(Left|Right)/.test(e.key)) return;
      const i = TABS.findIndex(([k]) => k === S.tab) + (e.key === "ArrowRight" ? 1 : -1);
      const b = $$("#seg button")[(i + TABS.length) % TABS.length];
      b.dispatchEvent(new PointerEvent("pointerdown")); b.focus();
    });
    $("#cmp-go").addEventListener("click", () => { cmpAdd(c.name, c.path); location.hash = "#/compare"; });
    $("#watch").addEventListener("click", (e) => {
      toggleWatch(c.name, c.path);
      const on = watched(c.path), b = e.currentTarget;
      b.setAttribute("aria-pressed", on);
      b.innerHTML = `${STAR(on)}<span>${on ? "In watchlist" : "Add to watchlist"}</span>`;
    });
    requestAnimationFrame(() => place(true));
    addEventListener("resize", () => place(true));
    if (S.price) renderPrice();
    updateCounts();
    renderTab(false);
  }

  function renderPrice() {
    const p = S.price, box = $("#spark");
    if (!box || !p) return;
    const pts = Tech.lastYear(p.points), first = pts[0][1], last = pts[pts.length - 1][1];
    const ch = ((last - first) / first) * 100;
    $("#delta").outerHTML = `<div class="delta ${ch >= 0 ? "up" : "down"}" id="delta">${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(1)}% <span class="faint" style="font-weight:400">past year · Mcap ${esc(ratio("Market Cap")?.value || "")}</span></div>`;
    box.innerHTML = "";
    box.appendChild(Charts.spark(pts, { width: 240 }));
  }

  function updateCounts() {
    const set = (k, v) => { const e = $(`[data-count="${k}"]`); if (e) e.textContent = v ? String(v) : ""; };
    set("people", S.people && S.people.found ? S.people.directors.length : "");
    const flagged = Object.values(S.news).reduce((a, n) => a + n.items.filter((i) => i.risk >= 2).length, 0);
    set("news", flagged ? flagged + " flagged" : "");
    const r = Risk.compute(S).filter((x) => x.level === "high").length;
    set("risks", r ? r + " high" : "");
  }

  function renderTab(isRefresh) {
    const el = $("#tab");
    if (!el) return;
    if (S.tab !== "network" && S.cy) { S.cy.destroy(); S.cy = null; }
    const fn = { overview: tabOverview, price: tabPrice, network: tabNetwork, people: tabPeople, owners: tabOwners, news: tabNews, risks: tabRisks, ...XTABS }[S.tab];
    const y = scrollY;
    fn(el, isRefresh);
    if (!isRefresh) el.firstElementChild && el.firstElementChild.classList.add("fade-in");
    else scrollTo({ top: y });
  }

  const pending = (msg) => `<div class="card"><div class="loading-line"><span class="spinner"></span>${esc(msg)}</div></div>`;

  /* ------------------------------------------------------------------ Overview */
  function tabOverview(el) {
    const c = S.company, T = c.tables;
    const tiles = c.ratios.map((r) => `<div class="tile"><div class="k">${esc(r.name)}${info(r.name)}</div><div class="v">${esc(r.value)}</div></div>`).join("");
    const pl = T["profit-loss"];
    const yrs = pl ? pl.headers : [];
    const find = (t, l) => t && t.rows.find((r) => r.label.toLowerCase().startsWith(l.toLowerCase()));
    const sales = find(pl, "Sales") || find(pl, "Revenue"), np = find(pl, "Net Profit");
    const qt = T.quarters;
    const qRows = ["Sales", "Revenue", "Operating Profit", "OPM", "Financing Profit", "Net Profit", "EPS"]
      .map((l) => find(qt, l)).filter((r, i, a) => r && a.indexOf(r) === i);
    const qCols = qt ? qt.headers.slice(-8) : [];
    const CHECK_G = { returns: S.score.isFin ? "roe" : "roce", sales: "cagr", profit: "cagr", debt: "debt to equity", cash: "cash conversion", promoter: "promoters", quarter: "yoy", price: "stock p/e" };
    const rowG = (l) => info(/^opm/i.test(l) ? "opm" : /^eps/i.test(l) ? "eps" : l);
    const tr = Score.trend(c);
    const note = store.get("sl-notes:" + c.path);
    const growth = (c.growth || []).map((g) => `<div><div class="muted" style="font-size:.8125rem;margin-bottom:4px">${esc(g.title)}${info(/return on equity/i.test(g.title) ? "roe" : "cagr")}</div>${g.rows.map((r) => `<div style="display:flex;justify-content:space-between;font-size:.875rem"><span class="faint">${esc(r[0].replace(":", ""))}</span><b class="num">${esc(r[1])}</b></div>`).join("")}</div>`).join("");
    const sc = S.score;
    const toneWord = { good: "Strong on these checks", medium: "Mixed picture", high: "Weak on these checks", info: "Not enough data" }[sc.tone];
    el.innerHTML = `<div class="grid">
      <div class="card"><div class="hc-head"><div><h2>Health check${info("health check")}</h2>
          <p class="sub">The same 8 plain rules for every company, so you can compare like with like. A reading aid, not a rating or advice.</p></div>
          <div class="hc-total tone-${sc.tone}"><b>${sc.passed}<span>/${sc.total}</span></b><small>${toneWord}</small></div></div>
        <div class="checks">${sc.checks.map((x) => `<div class="check ${x.status}">
          <div class="ic ${STATUS_ICON[x.status]}">${ICON[STATUS_ICON[x.status]]}</div>
          <div style="min-width:0"><div class="check-top"><span>${esc(x.label)}${info(CHECK_G[x.key])}</span><b class="num">${esc(x.value)}</b></div>
          <p>${esc(x.why)}</p><p class="faint">${x.status === "na" ? "Not counted" : esc(x.rule)}</p></div></div>`).join("")}</div>
      </div>
      <div class="grid g2">
        <div class="card"><div class="hc-head"><div><h2>Is it getting stronger?${info("piotroski")}</h2>
            <p class="sub">${tr ? `Eight yes/no questions comparing ${esc(tr.to)} with ${esc(tr.from)}.` : "Trend score"}</p></div>
            ${tr ? `<div class="hc-total tone-${tr.tone}"><b>${tr.passed}<span>/${tr.total}</span></b></div>` : ""}</div>
          ${tr ? `<ul class="list trend">${tr.items.map((x) => `<li><span class="${x.pass == null ? "faint" : x.pass ? "tone-good" : "tone-high"}">${x.pass == null ? ICON.low : x.pass ? ICON.good : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'}</span><span>${esc(x.label)}</span><span class="faint num">${esc(x.detail)}</span></li>`).join("")}</ul>`
            : `<p class="muted">Not worked out for banks and lenders, or when yearly accounts are missing — these questions do not fit them.</p>`}
        </div>
        <div class="card notes"><h2>My notes</h2><p class="sub">Write your own reasons before you decide. Saved only in this browser.</p>
          ${[["why", "Why does this company interest me?"], ["worry", "What worries me?"], ["change", "What would change my mind?"]].map(([k, l]) => `<label>${l}<textarea data-note="${k}" rows="2" spellcheck="false">${esc((note && note[k]) || "")}</textarea></label>`).join("")}
          <div class="faint" id="note-saved" style="font-size:.75rem">${note && note.at ? "Saved " + new Date(note.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}</div>
        </div>
      </div>
      <div class="tiles">${tiles}</div>
      <div class="grid g2">
        <div class="card"><h2>About</h2>
          <p class="sub">${c.website ? `<a href="${esc(c.website)}" target="_blank" rel="noopener">${esc(c.website.replace(/^https?:\/\//, ""))} ${ICON.ext}</a>` : ""}</p>
          <p style="margin:0 0 12px">${esc(c.about || "No description available.")}</p>
          ${c.key_points ? `<div class="prose clamp" id="kp">${esc(c.key_points)}</div><button class="link-btn" id="kp-more" style="margin-top:6px">Show more</button>` : ""}
        </div>
        <div class="card"><h2>Quick read</h2><p class="sub">Machine-generated checklist from Screener — a starting point, not a conclusion.</p>
          <ul class="list pc">
            ${c.pros.map((p) => `<li><span style="color:var(--good)">${ICON.good}</span><span>${esc(p)}</span></li>`).join("")}
            ${c.cons.map((p) => `<li><span style="color:var(--med)">${ICON.medium}</span><span>${esc(p)}</span></li>`).join("")}
            ${!c.pros.length && !c.cons.length ? '<li class="muted">Nothing flagged.</li>' : ""}
          </ul>
        </div>
      </div>
      <div class="grid g2">
        <div class="card"><h2>${esc(sales ? sales.label : "Sales")}</h2><p class="sub">₹ Crore, yearly${yrs.at(-1) === "TTM" ? " · last bar is trailing 12 months" + info("ttm") : ""}</p><div id="ch-sales"></div></div>
        <div class="card"><h2>Net profit</h2><p class="sub">₹ Crore, yearly. Losses show in red.</p><div id="ch-np"></div></div>
      </div>
      ${qRows.length ? `<div class="card"><h2>Recent quarters</h2><p class="sub">₹ Crore unless marked %</p><div class="scroll-x"><table class="t">
        <thead><tr><th></th>${qCols.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${qRows.map((r) => `<tr><td>${esc(r.label)}${rowG(r.label)}</td>${r.values.slice(-8).map((v) => `<td>${inr(v, 1)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>` : ""}
      ${growth ? `<div class="card"><h2>Growth & returns</h2><p class="sub">Compounded annual rates</p><div class="grid g3" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${growth}</div></div>` : ""}
      <div class="grid g2">
        <div class="card"><h2>What the company is telling the exchange</h2><p class="sub">Latest filings on BSE</p>
          <ul class="list">${(c.announcements || []).slice(0, 8).map((a) => `<li><a href="${esc(a.href)}" target="_blank" rel="noopener">${esc(a.title)}</a><div class="faint" style="font-size:.8125rem">${a.date ? new Date(a.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}${a.note ? " · " + esc(a.note) : ""}</div></li>`).join("") || '<li class="muted">None found.</li>'}</ul>
        </div>
        <div class="card"><h2>Source documents</h2><p class="sub">Primary sources to verify anything here</p>
          ${docList("Annual reports", c.annual_reports)}${docList("Earnings calls" + info("concall"), c.concalls)}${docList("Credit ratings" + info("credit rating"), c.credit_ratings)}
        </div>
      </div></div>`;
    if (sales && yrs.length) $("#ch-sales").appendChild(Charts.bars(yrs, sales.values, { color: "var(--s1)", name: "Sales", tipFmt: (v) => "₹" + inr(v) + " Cr", width: $("#ch-sales").clientWidth }));
    if (np && yrs.length) $("#ch-np").appendChild(Charts.bars(yrs, np.values, { color: "var(--s3)", name: "Net profit", tipFmt: (v) => "₹" + inr(v) + " Cr", width: $("#ch-np").clientWidth }));
    $$("[data-note]", el).forEach((t) => t.addEventListener("input", () => {
      const n = { at: Date.now() };
      $$("[data-note]", el).forEach((x) => (n[x.dataset.note] = x.value));
      store.set("sl-notes:" + c.path, n);
      $("#note-saved").textContent = "Saved just now";
    }));
    const more = $("#kp-more");
    if (more) more.addEventListener("click", () => { const k = $("#kp"); k.classList.toggle("clamp"); more.textContent = k.classList.contains("clamp") ? "Show more" : "Show less"; });
  }
  function docList(title, list) {
    if (!list || !list.length) return "";
    return `<div style="margin-bottom:12px"><div class="muted" style="font-size:.8125rem;margin-bottom:4px">${title}</div>${list.slice(0, 4).map((d) => `<div style="font-size:.875rem;padding:3px 0">${d.date ? `<span class="faint" style="display:inline-block;width:70px">${esc(d.date)}</span>` : ""}${d.links.map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.text)}</a>`).join(" · ")}${d.note ? ` <span class="faint">${esc(d.note)}</span>` : ""}</div>`).join("")}</div>`;
  }

  /* ------------------------------------------------------------------ Price & valuation */
  const RANGES = [["1M", 31], ["6M", 183], ["1Y", 365], ["3Y", 1096], ["5Y", 1830]];
  const dLabel = (ts, long) => new Date(ts * 1000).toLocaleDateString("en-IN", long ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });
  function tabPrice(el) {
    const p = S.price, c = S.company;
    if (!p) {
      el.innerHTML = S.priceDone ? `<div class="card empty">No price history found for this stock on Yahoo Finance.</div>` : pending("Loading five years of prices…");
      return;
    }
    S.pr = S.pr || "1Y";
    setTimeout(() => HOOKS.price && $("#pro-top") && HOOKS.price(el), 0);
    const pts = p.points, v = pts.map((x) => x[1]), last = v[v.length - 1];
    const s50 = Tech.sma(v, 50), s200 = Tech.sma(v, 200);
    const a50 = s50[s50.length - 1], a200 = s200[s200.length - 1];
    const yr = Tech.lastYear(pts).map((x) => x[1]);
    const hi = Math.max(...yr), lo = Math.min(...yr), pos = hi > lo ? ((last - lo) / (hi - lo)) * 100 : 50;
    const rsi = Tech.rsi(v), dd = Tech.drawdown(v), vol = Tech.vol(yr);
    const nf = S.nifty && S.nifty.points, nVol = nf ? Tech.vol(Tech.lastYear(nf).map((x) => x[1])) : null;
    const dlv = (S.val && S.val.delivery) || [];
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y[1], 0) / a.length : null);
    const dNow = avg(dlv.slice(-4)), dYear = avg(dlv.slice(-52));
    const vs = (a) => (a ? (last / a - 1) * 100 : null);
    const sig = (key, label, value, cls, note) => `<div class="tile"><div class="k">${label}${info(key)}</div><div class="v ${cls || ""}">${value}</div><div class="h">${note}</div></div>`;
    const periods = [["1 month", 30], ["3 months", 91], ["6 months", 182], ["1 year", 365], ["3 years", 1095], ["5 years", 1815]];
    const retRows = periods.map(([l, d]) => {
      const a = Tech.ret(pts, d), b = nf ? Tech.ret(nf, d) : null, diff = a != null && b != null ? a - b : null;
      return `<tr><td>${l}</td><td class="${tone(a)}">${signed(a)}</td><td>${signed(b)}</td><td class="${tone(diff)}"><b>${diff == null ? "—" : (diff > 0 ? "+" : "") + diff.toFixed(1) + " pts"}</b></td></tr>`;
    }).join("");
    // Valuation against its own past
    const pe = (S.val && S.val.pe) || [], med = S.val && S.val.median_pe, eps = (S.val && S.val.eps) || [];
    const peNow = pe.length ? pe[pe.length - 1][1] : null;
    const below = pe.length ? Math.round((pe.filter((x) => x[1] < peNow).length / pe.length) * 100) : null;
    const epsCh = eps.length > 1 && eps[0][1] > 0 ? (eps[eps.length - 1][1] / eps[0][1] - 1) * 100 : null;
    el.innerHTML = `<div class="grid">
      <div id="pro-top"></div>
      <div class="card" id="pchart"><div class="hc-head"><div><h2>Price</h2><p class="sub">Daily closing price with its 50-day and 200-day averages${info("moving average")}. Hover the chart for exact values.</p></div>
        <div class="seg mini" id="pr-seg">${RANGES.map(([k]) => `<button data-pr="${k}" aria-selected="${k === S.pr}">${k}</button>`).join("")}</div></div>
        <div id="ch-price"></div></div>
      <div class="tiles">
        ${sig("moving average", "Against 200-day average", signed(vs(a200)), tone(vs(a200)), a200 ? (last >= a200 ? "Above its long-term trend" : "Below its long-term trend") : "Needs 200 days of history")}
        ${sig("moving average", "Against 50-day average", signed(vs(a50)), tone(vs(a50)), a50 ? (last >= a50 ? "Above its short-term trend" : "Below its short-term trend") : "")}
        ${sig("rsi", "RSI (14 days)", rsi == null ? "—" : rsi.toFixed(0), "", rsi == null ? "" : rsi >= 70 ? "Has risen very fast lately" : rsi <= 30 ? "Has fallen very fast lately" : "Normal range (30–70)")}
        <div class="tile"><div class="k">52-week range${info("52-week range")}</div><div class="v">${pos.toFixed(0)}%</div>
          <div class="range"><i style="left:${pos.toFixed(1)}%"></i></div><div class="h" style="display:flex;justify-content:space-between"><span>₹${inr(lo)}</span><span>₹${inr(hi)}</span></div></div>
        ${sig("drawdown", "Biggest fall, 5 years", dd.toFixed(0) + "%", "", "From a peak to the next low")}
        ${sig("volatility", "Volatility, 1 year", vol == null ? "—" : vol.toFixed(0) + "%", "", nVol ? `Nifty 50: ${nVol.toFixed(0)}% — ${vol > nVol * 2.5 ? "a much bumpier ride" : vol > nVol ? "a bumpier ride" : "a calmer ride"}` : "")}
        ${dNow != null ? sig("delivery", "Delivery, last 4 weeks", dNow.toFixed(0) + "%", "", `1-year average ${dYear.toFixed(0)}% — ${dNow > dYear + 5 ? "more buying to hold than usual" : dNow < dYear - 5 ? "more short-term trading than usual" : "about normal"}`) : ""}
      </div>
      <div class="grid g2">
        <div class="card"><h2>Returns against the market</h2><p class="sub">Price change only (dividends left out), next to the Nifty 50${info("nifty")}. The last column is how far ahead or behind the stock is.</p>
          <div class="scroll-x"><table class="t"><thead><tr><th>Period</th><th>${esc(shortName(c.name))}</th><th>Nifty 50</th><th>Difference</th></tr></thead><tbody>${retRows}</tbody></table></div>
          ${nf ? "" : `<div class="loading-line" style="margin-top:10px"><span class="spinner"></span>Loading the Nifty 50…</div>`}</div>
        <div class="card"><h2>Price against its own past</h2>
          ${!S.val ? `<div class="loading-line"><span class="spinner"></span>Loading 5 years of P/E…</div>` : pe.length < 10 ? `<p class="muted">No P/E history available (common for loss-making companies).</p>` : `
          <p class="sub">P/E${info("stock p/e")} over 5 years with its median${info("median pe")}.</p>
          <div id="ch-pe"></div>
          <p style="margin:12px 0 0;font-size:.9375rem">P/E is <b>${peNow.toFixed(1)}</b> today against a 5-year median of <b>${med != null ? med.toFixed(1) : "—"}</b>. It was lower than today for <b>${below}%</b> of the past 5 years.${epsCh != null ? ` Profit per share${info("eps")} went from ₹${inr(eps[0][1], 1)} to ₹${inr(eps[eps.length - 1][1], 1)} (${signed(epsCh, 0)}) in that time.` : ""}</p>
          <p class="sub" style="margin:8px 0 0">A P/E below its own past can mean the share is cheaper than usual — or that the market expects profit to slow. This shows where it stands, not which one it is.</p>`}</div>
      </div>
      <div id="pro-bottom" class="grid g2"></div></div>`;
    const draw = () => {
      const days = RANGES.find(([k]) => k === S.pr)[1], cut = pts[pts.length - 1][0] - days * 86400;
      let i0 = pts.findIndex((x) => x[0] >= cut);
      if (i0 < 0) i0 = 0;
      const box = $("#ch-price");
      box.innerHTML = "";
      box.appendChild(Charts.lines(pts.slice(i0).map((x) => dLabel(x[0], days > 200)), [
        { name: "Price", color: "var(--s1)", values: v.slice(i0) },
        { name: "50-day average", color: "var(--s4)", values: s50.slice(i0) },
        { name: "200-day average", color: "var(--s2)", values: s200.slice(i0) },
      ], { fmt: (x) => "₹" + inr(x, x < 100 ? 1 : 0), width: box.clientWidth, height: 280 }));
    };
    // Full trading-style chart when the chart library is available; the simple line chart is the fallback.
    const sym = c.nse_symbol ? c.nse_symbol + ".NS" : c.bse_code ? c.bse_code + ".BO" : null;
    if (window.ProChart && window.LightweightCharts && sym) ProChart.mount($("#pchart"), sym, shortName(c.name));
    else draw();
    $$("[data-pr]", el).forEach((b) => b.addEventListener("click", () => {
      S.pr = b.dataset.pr;
      $$("[data-pr]", el).forEach((x) => x.setAttribute("aria-selected", x === b));
      draw();
    }));
    const peBox = $("#ch-pe");
    if (peBox) peBox.appendChild(Charts.lines(pe.map((x) => dLabel(Date.parse(x[0]) / 1000, true)), [
      { name: "P/E", color: "var(--s1)", values: pe.map((x) => x[1]) },
      ...(med != null ? [{ name: "5-year median", color: "var(--s2)", values: pe.map(() => med) }] : []),
    ], { fmt: (x) => String(+x.toFixed(1)), width: peBox.clientWidth, height: 200 }));
  }

  /* ------------------------------------------------------------------ Compare */
  const CMP = new Map(); // path -> { c, score, trend, price }
  function cmpAdd(name, path) {
    const list = store.get("sl-compare").filter((x) => x.path !== path);
    store.set("sl-compare", [...list, { name, path }].slice(-4));
  }
  function comparePage() {
    document.title = "Compare · Stock Lens";
    if (S.cy) { S.cy.destroy(); S.cy = null; }
    scrollTo({ top: 0 });
    $("#view").innerHTML = `<div class="co-head fade-in"><div><h1>Compare</h1><p class="sub" style="margin:8px 0 0">Up to 4 companies side by side on the same checks. Comparing within one industry is fairest.</p></div></div>
      <div class="card"><div id="cmp-pick"></div><div id="cmp-table"></div></div>`;
    renderCompare();
  }
  function renderCompare() {
    const pick = $("#cmp-pick"), box = $("#cmp-table");
    if (!pick) return;
    const list = store.get("sl-compare");
    const inList = (p) => list.some((x) => x.path === p);
    const sugg = [];
    const push = (name, path) => { if (path && !inList(path) && !sugg.some((s) => s.path === path)) sugg.push({ name, path }); };
    list.forEach((x) => { const d = CMP.get(x.path); ((d && d.peers) || []).slice(0, 6).forEach((p) => push(p.name, p.path)); });
    store.get("sl-watch").forEach((w) => push(shortName(w.name), w.path));
    store.get("sl-recent").forEach((w) => push(shortName(w.name), w.path));
    pick.innerHTML = `<div class="filters">
        ${list.map((x) => `<span class="chip on">${esc(shortName(x.name))}<button class="chip-x" data-rm="${esc(x.path)}" aria-label="Remove ${esc(shortName(x.name))}">×</button></span>`).join("")}
        ${list.length < 4 ? `<span class="cmp-add"><input id="cmp-q" type="search" placeholder="Add a company…" autocomplete="off" spellcheck="false"><div class="results hidden" id="cmp-res"></div></span>` : ""}</div>
      ${list.length < 4 && sugg.length ? `<div class="filters"><span class="faint" style="font-size:.8125rem">Quick add</span>${sugg.slice(0, 8).map((s) => `<button class="chip press" data-add="${esc(s.path)}" data-name="${esc(s.name)}">+ ${esc(s.name)}</button>`).join("")}</div>` : ""}`;
    $$("[data-rm]", pick).forEach((b) => b.addEventListener("click", () => { store.set("sl-compare", list.filter((x) => x.path !== b.dataset.rm)); renderCompare(); }));
    $$("[data-add]", pick).forEach((b) => b.addEventListener("click", () => { cmpAdd(b.dataset.name, b.dataset.add); renderCompare(); }));
    const cq = $("#cmp-q"), res = $("#cmp-res");
    if (cq) {
      let t = 0;
      cq.addEventListener("input", () => {
        clearTimeout(t);
        const val = cq.value.trim();
        if (val.length < 2) return res.classList.add("hidden");
        t = setTimeout(async () => {
          try {
            const r = await api("/api/search", { q: val });
            res.innerHTML = r.slice(0, 8).map((x) => `<button data-p="${esc(x.path)}" data-n="${esc(x.name)}"><span>${esc(x.name)}</span></button>`).join("") || `<div class="empty" style="padding:14px">No match</div>`;
            res.classList.remove("hidden");
          } catch (e) {}
        }, 150);
      });
      res.addEventListener("pointerdown", (e) => { const b = e.target.closest("button[data-p]"); if (b) { e.preventDefault(); cmpAdd(b.dataset.n, b.dataset.p); renderCompare(); } });
      cq.addEventListener("blur", () => setTimeout(() => res.classList.add("hidden"), 120));
    }
    if (!list.length) { box.innerHTML = `<div class="empty">Add two or more companies to compare them. You can also press “Compare” on any company page.</div>`; return; }
    // Load whatever is missing, then draw again.
    list.forEach((x) => {
      if (CMP.has(x.path)) return;
      const d = { loading: true };
      CMP.set(x.path, d);
      api("/api/company", { path: x.path }).then((c) => {
        Object.assign(d, { loading: false, c, score: Score.compute(c), trend: Score.trend(c), peers: (c.peers || []).filter((p) => p.path !== c.path) });
        renderCompare();
        const sym = c.nse_symbol ? c.nse_symbol + ".NS" : c.bse_code ? c.bse_code + ".BO" : null;
        if (sym) api("/api/price", { symbol: sym, range: "5y" }).then((p) => { d.price = p.points; renderCompare(); }).catch(() => {});
      }).catch(() => { d.loading = false; d.err = true; renderCompare(); });
    });
    const cols = list.map((x) => ({ x, d: CMP.get(x.path) || {} }));
    const cell = (fn) => cols.map(({ d }) => `<td>${d.c ? fn(d) : d.err ? '<span class="faint">failed</span>' : '<span class="spinner" style="display:inline-block"></span>'}</td>`).join("");
    const rat = (d, re) => { const r = (d.c.ratios || []).find((q) => re.test(q.name)); return r ? esc(r.value) : "—"; };
    const row = (label, key, fn) => `<tr><td>${label}${key ? info(key) : ""}</td>${cell(fn)}</tr>`;
    const check = (i) => (d) => { const k = d.score.checks[i]; return `<span class="st ${k.status}">${esc(k.value)}</span>`; };
    const retCell = (days) => (d) => { const r = d.price ? Tech.ret(d.price, days) : null; return `<span class="${tone(r)}">${d.price ? signed(r) : "…"}</span>`; };
    const first = cols.find((k) => k.d.score);
    const labels = first ? first.d.score.checks.map((k) => k.label) : [];
    const gkeys = ["roce", "cagr", "cagr", "debt to equity", "cash conversion", "promoters", "yoy", "stock p/e"];
    box.innerHTML = `<div class="scroll-x"><table class="t cmp-t"><thead><tr><th></th>${cols.map(({ x, d }) => `<th><a href="#/c${esc(x.path)}">${esc(shortName(d.c ? d.c.name : x.name))}</a></th>`).join("")}</tr></thead><tbody>
      ${row("Industry", null, (d) => { const s = (d.c.sector || []).find((q) => q.level === "Industry") || (d.c.sector || []).slice(-1)[0]; return `<span class="muted">${esc(s ? s.name : "—")}</span>`; })}
      ${row("Health checks passed", "health check", (d) => `<span class="score-cell">${scoreBar(d.score)}<b class="tone-${d.score.tone}">${d.score.passed}/${d.score.total}</b></span>`)}
      ${labels.map((l, i) => row(i === 0 ? "Return on capital / equity" : esc(l), gkeys[i], check(i))).join("")}
      ${row("Trend score", "piotroski", (d) => (d.trend ? `<b class="tone-${d.trend.tone}">${d.trend.passed}/${d.trend.total}</b>` : '<span class="faint">n/a</span>'))}
      ${row("Market cap", "market cap", (d) => rat(d, /Market Cap/i))}
      ${row("Dividend yield", "dividend yield", (d) => rat(d, /Dividend Yield/i))}
      ${row("ROE", "roe", (d) => rat(d, /^ROE/i))}
      ${row("Price, 1 year", null, retCell(365))}
      ${row("Price, 3 years", null, retCell(1095))}
      ${row("Price, 5 years", null, retCell(1815))}
    </tbody></table></div>
    <p class="sub" style="margin:14px 0 0">Green = passes the check, amber = watch, red = fails, grey = does not apply. Tap a company name to open its full page.</p>`;
  }

  /* ------------------------------------------------------------------ Owners & dealings */
  function tabOwners(el) {
    const c = S.company, shp = c.shareholding;
    const cats = ["Promoters", "FIIs", "DIIs", "Government", "Public"];
    const colors = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];
    const series = shp ? cats.map((n, i) => ({ name: n, color: colors[i], values: (shp.rows.find((r) => r.label === n) || {}).values })).filter((s) => s.values && s.values.some((v) => v)) : [];
    const nsh = shp && shp.rows.find((r) => /shareholders/i.test(r.label));
    const hRows = (c.holders || []).map((h, i) => {
      const v = h.series.map((p) => p.value);
      const yAgo = v.length >= 5 ? v[v.length - 5] : null;
      const d = yAgo != null && h.latest != null ? h.latest - yAgo : null;
      return `<tr data-h="${i}" style="cursor:pointer"><td style="white-space:normal;min-width:200px">${esc(h.name)}</td><td style="text-align:left"><span class="pill">${esc(h.category)}</span></td><td><b>${h.latest != null ? h.latest.toFixed(2) + "%" : "—"}</b></td><td class="${d > 0 ? "" : ""}" style="color:${d > 0.05 ? "var(--good)" : d < -0.05 ? "var(--high)" : "var(--text-3)"}">${d == null ? "new" : (d > 0 ? "+" : "") + d.toFixed(2)}</td><td>${Charts.micro(v)}</td></tr>`;
    }).join("");
    const rp = (c.related_parties && c.related_parties.parties) || [];
    el.innerHTML = `<div class="grid">
      <div class="card"><h2>Who owns it</h2><p class="sub">% of shares by holder type, quarterly${nsh ? ` · ${inr(lastOf(nsh.values))} shareholders now` : ""}</p>
        <p class="sub">What the groups mean: Promoters${info("promoters")} · FIIs${info("fiis")} · DIIs${info("diis")} · Public${info("public")}</p><div id="ch-shp"></div></div>
      <div class="card"><h2>Named shareholders</h2><p class="sub">Holders above 1% disclosed in the latest filing. Change is vs. 4 quarters ago. Tap a row for detail.</p>
        <div class="scroll-x"><table class="t"><thead><tr><th>Holder</th><th style="text-align:left">Type</th><th>Holds</th><th>1y change</th><th>Trend</th></tr></thead><tbody>${hRows || '<tr><td colspan="5" class="muted">No named holders disclosed.</td></tr>'}</tbody></table></div>
        ${(c.exited_holders || []).length ? `<p class="sub" style="margin:14px 0 0">Not in latest list (sold below 1%, exited, or renamed): ${c.exited_holders.map((h) => `${esc(h.name)} <span class="faint">(peak ${h.peak}%)</span>`).join(", ")}</p>` : ""}
      </div>
      <div class="card"><h2>Who it deals with — related parties${info("related party")}</h2>
        <p class="sub">Parent, group companies, subsidiaries and insiders the company transacted with, extracted from annual reports. Amounts need a Screener login; the annual report has them.</p>
        ${rp.length ? `<ul class="list">${rp.slice(0, S.rpAll ? rp.length : 25).map((p, i) => `<li style="display:flex;gap:12px;align-items:flex-start;cursor:pointer" data-rp="${i}">
            <span class="dot" style="background:var(--n-related);margin-top:7px"></span>
            <div style="flex:1;min-width:0"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b style="font-weight:600">${esc(p.name)}</b>${p.relation ? `<span class="pill">${esc(p.relation)}</span>` : ""}</div>
            <div class="faint" style="font-size:.8125rem;margin-top:3px">${esc(p.transactions.slice(0, 6).join(" · "))}${p.transactions.length > 6 ? ` · +${p.transactions.length - 6} more` : ""}</div></div></li>`).join("")}</ul>
          ${rp.length > 25 ? `<button class="link-btn" id="rp-all" style="margin-top:8px">${S.rpAll ? "Show fewer" : `Show all ${rp.length}`}</button>` : ""}`
          : '<p class="muted">No related-party data extracted for this company.</p>'}
      </div>
      <div class="card"><h2>Peers${info("peers")}</h2><p class="sub">Companies in the same industry, by Screener. Tap to compare.</p>
        <div class="scroll-x"><table class="t"><thead><tr><th>Company</th><th>Price ₹</th><th>P/E${info("stock p/e")}</th><th>Mcap ₹ Cr${info("market cap")}</th><th>Div yld %${info("dividend yield")}</th><th>Qtr profit var %${info("qtr profit var")}</th><th>ROCE %${info("roce")}</th></tr></thead><tbody>
        ${(c.peers || []).map((p, i) => `<tr data-peer="${i}" style="cursor:pointer;${p.path === c.path ? "font-weight:600" : ""}"><td>${esc(p.name)}</td><td>${inr(p["CMP Rs."], 1)}</td><td>${inr(p["P/E"], 1)}</td><td>${inr(p["Mar Cap Rs.Cr."])}</td><td>${inr(p["Div Yld %"], 2)}</td><td style="color:${p["Qtr Profit Var %"] < 0 ? "var(--high)" : "inherit"}">${inr(p["Qtr Profit Var %"], 1)}</td><td>${inr(p["ROCE %"], 1)}</td></tr>`).join("")}
        </tbody></table></div></div>
    </div>`;
    if (series.length) $("#ch-shp").appendChild(Charts.lines(shp.headers, series, { fmt: (v) => +v.toFixed(2) + "%", yMin: 0, width: $("#ch-shp").clientWidth, height: 220 }));
    const rpAll = $("#rp-all", el);
    if (rpAll) rpAll.addEventListener("click", () => { S.rpAll = !S.rpAll; tabOwners(el); });
    $$("tr[data-h]", el).forEach((tr) => tr.addEventListener("click", () => openNode(holderNode(c.holders[+tr.dataset.h]))));
    $$("[data-rp]", el).forEach((li) => li.addEventListener("click", () => openNode(rpNode(rp[+li.dataset.rp]))));
    $$("tr[data-peer]", el).forEach((tr) => tr.addEventListener("click", () => openNode(peerNode(c.peers[+tr.dataset.peer]))));
  }
  const lastOf = (a) => (a || []).filter((x) => x != null).slice(-1)[0];

  /* ------------------------------------------------------------------ People */
  function tabPeople(el) {
    const P = S.people;
    if (!P && !S.peopleErr) { el.innerHTML = pending("Looking up directors in Ministry of Corporate Affairs records…"); return; }
    if (S.peopleErr || !P.found) {
      el.innerHTML = `<div class="card empty">${S.peopleErr ? `<p class="err">${esc(S.peopleErr)}</p>` : `<p>Couldn't match “${esc(S.company.name)}” in the company registry.</p>`}<p class="faint">Directors come from ZaubaCorp (MCA data). Try again later.</p></div>`;
      return;
    }
    const dirs = [...P.directors].sort((a, b) => isKey(b.designation) - isKey(a.designation));
    // Shared boards: other companies where 2+ of this board also sit (interlocks).
    const shared = {};
    for (const d of P.directors) for (const co of d.current || []) {
      if (co.cin === P.cin) continue;
      (shared[co.cin] = shared[co.cin] || { ...co, people: [] }).people.push(tc(d.name));
    }
    const inter = Object.values(shared).filter((x) => x.people.length >= 2).sort((a, b) => b.people.length - a.people.length);
    const newsFor = (d) => S.news["p:" + d.din];
    el.innerHTML = `<div class="grid">
      <div class="card"><h2>Registry record</h2><p class="sub">Ministry of Corporate Affairs data via ZaubaCorp — can lag the latest filings.</p>
        <dl class="kv" style="grid-template-columns:auto 1fr auto 1fr">
          <dt>CIN${info("cin")}</dt><dd style="text-align:left" class="num">${esc(P.cin)}</dd>
          <dt>Status</dt><dd style="text-align:left">${P.status ? badge(/^active$/i.test(P.status) ? "good" : "high", P.status) : "—"}</dd>
          <dt>Type</dt><dd style="text-align:left">${esc(P.type || "—")}${P.listed ? " · Listed" : ""}</dd>
          <dt>Incorporated</dt><dd style="text-align:left">${esc(P.founded || "—")}</dd>
          <dt>Registrar${info("registrar")}</dt><dd style="text-align:left">${esc(P.roc || "—")}</dd>
          <dt>Paid-up capital${info("paid-up capital")}</dt><dd style="text-align:left">${P.paid_up_capital ? "₹" + inr(P.paid_up_capital / 1e7, 1) + " Cr" : "—"}</dd>
          <dt>Last balance sheet</dt><dd style="text-align:left">${esc(P.last_balance_sheet || "—")}</dd>
          <dt>Last AGM${info("agm")}</dt><dd style="text-align:left">${esc(P.last_agm || "—")}</dd>
        </dl>
        <p class="sub" style="margin:0">${esc(P.address || "")} · <a href="${esc(P.url)}" target="_blank" rel="noopener">Open record ${ICON.ext}</a></p>
      </div>
      <div class="grid g3" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
        ${dirs.map((d, i) => {
          const cur = d.current || [], past = d.past || [];
          const listed = cur.filter((x) => x.listed).length;
          const ap = Risk.parseDate(d.appointed);
          const yrs = ap ? (Date.now() - ap) / (365.25 * 864e5) : null;
          const n = newsFor(d);
          const flagged = n ? n.items.filter((x) => x.risk >= 2).length : 0;
          const flags = [];
          if (cur.length > 12) flags.push(badge("low", `${cur.length} boards`));
          if (yrs != null && yrs < 1 && isKey(d.designation)) flags.push(badge("info", "New in role"));
          if (flagged) flags.push(badge(n.items.some((x) => x.risk === 3) ? "high" : "medium", `${flagged} flagged headline${flagged > 1 ? "s" : ""}`));
          if (n && !n.loading && !flagged && n.items.length) flags.push(badge("good", "No flagged news"));
          return `<div class="card person">
            <div class="person-top"><div class="avatar ${isKey(d.designation) ? "key" : ""}" aria-hidden="true">${esc(initials(d.name))}</div>
              <div style="min-width:0"><h3>${esc(tc(d.name))}</h3><div class="muted" style="font-size:.875rem">${esc(d.designation || "")}${yrs != null ? ` · ${yrs < 1 ? "since " + ap.toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : Math.floor(yrs) + " yr" + (Math.floor(yrs) > 1 ? "s" : "")}` : ""}</div></div></div>
            <div class="stats"><div><b>${cur.length}</b>current boards</div><div><b>${listed}</b>listed</div><div><b>${past.length}</b>past roles</div></div>
            ${flags.length ? `<div class="tagrow">${flags.join("")}</div>` : ""}
            ${cur.length ? `<ul class="list co-list">${cur.filter((x) => x.cin !== P.cin).slice(0, 40).map((x, j) => `<li><a href="#" class="nm" data-d="${i}" data-c="${j}" title="${esc(x.name)}">${esc(tc(x.name))}</a><span class="faint" style="flex:none">${x.listed ? "Listed" : esc((x.type || "").replace(" company", ""))}</span></li>`).join("")}</ul>` : ""}
            <div class="btn-row" style="margin:0"><button class="btn secondary" data-person="${i}">Details & news</button><a class="btn secondary" href="${esc(d.url)}" target="_blank" rel="noopener">MCA record ${ICON.ext}</a></div>
          </div>`;
        }).join("")}
      </div>
      ${inter.length ? `<div class="card"><h2>Shared boards${info("shared boards")}</h2><p class="sub">Other companies where two or more of these directors sit together — the tightest links in the group.</p>
        <ul class="list">${inter.slice(0, 15).map((x, i) => `<li style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><a href="#" data-inter="${i}" style="text-transform:capitalize">${esc(tc(x.name))}</a><span class="muted" style="font-size:.875rem">${esc(x.people.join(", "))}</span></li>`).join("")}</ul></div>` : ""}
      ${(P.past_officers || []).length ? `<div class="card"><h2>Former directors & officers</h2><p class="sub">${P.past_officers.length} people who have left the board or key roles over the company's life.</p>
        <div class="tagrow">${P.past_officers.slice(0, 40).map((o) => `<span class="pill" title="${esc(o.role || "")}">${esc(tc(o.name))}</span>`).join("")}</div></div>` : ""}
    </div>`;
    $$("[data-person]", el).forEach((b) => b.addEventListener("click", () => openNode(personNode(dirs[+b.dataset.person]))));
    $$("a[data-d]", el).forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openNode(linkedNode(dirs[+a.dataset.d].current.filter((x) => x.cin !== P.cin)[+a.dataset.c])); }));
    $$("a[data-inter]", el).forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openNode(linkedNode(inter[+a.dataset.inter])); }));
  }

  /* ------------------------------------------------------------------ News */
  function tabNews(el) {
    const groups = Object.values(S.news);
    const loading = groups.some((g) => g.loading) || (!S.people && !S.peopleErr);
    let all = [];
    for (const g of groups) for (const it of g.items) all.push({ ...it, g });
    const seen = new Set();
    all = all.filter((x) => { const k = x.link; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.ts - a.ts);
    let list = all.filter((x) => (S.newsFilter === "all" || x.g.key === S.newsFilter) && (!S.flaggedOnly || x.risk >= 2));
    const chip = (k, label, n) => `<button class="chip press ${S.newsFilter === k ? "on" : ""}" data-nf="${esc(k)}">${esc(label)}${n ? ` <span style="opacity:.6">${n}</span>` : ""}</button>`;
    el.innerHTML = `<div class="card">
      <h2>What's happening</h2><p class="sub">Last 12 months from Google News for the company, its key people and main promoters. Flags come from simple keyword rules — always read the article.</p>
      <div class="filters">${chip("all", "All", all.length)}${groups.map((g) => chip(g.key, g.label, g.items.length)).join("")}
        <button class="chip press ${S.flaggedOnly ? "on" : ""}" id="nf-flag">${ICON.high} Flagged only</button></div>
      ${loading ? `<div class="loading-line" style="margin-bottom:8px"><span class="spinner"></span>Gathering more headlines…</div>` : ""}
      <div>${list.length ? list.slice(0, 120).map((x) => `<div class="news-item"><div class="when">${ago(x.ts)}</div><div style="min-width:0">
          <a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a>
          <div class="meta"><span>${esc(x.source)}</span><span class="pill">${esc(x.g.label)}</span>${x.tags.map((t) => badge(t.severity, t.label)).join("")}</div></div></div>`).join("")
        : `<div class="empty">${loading ? "" : "No headlines match."}</div>`}</div></div>`;
    $$("[data-nf]", el).forEach((b) => b.addEventListener("click", () => { S.newsFilter = b.dataset.nf; tabNews(el); }));
    $("#nf-flag", el).addEventListener("click", () => { S.flaggedOnly = !S.flaggedOnly; tabNews(el); });
  }

  /* ------------------------------------------------------------------ Risks */
  function tabRisks(el) {
    const risks = Risk.compute(S);
    const cnt = (l) => risks.filter((r) => r.level === l).length;
    const waiting = !S.people && !S.peopleErr || Object.values(S.news).some((n) => n.loading);
    const row = (r) => `<div class="risk"><div class="ic ${r.level}">${ICON[r.level]}</div><div style="min-width:0">
      <div class="area">${esc(r.area)} · ${esc(LEVEL_LABEL[r.level])}</div><h4>${esc(r.title)}</h4>${r.detail ? `<p>${esc(r.detail)}</p>` : ""}<p class="faint" style="font-size:.75rem">Source: ${esc(r.source)}</p></div></div>`;
    const bad = risks.filter((r) => r.level !== "good"), good = risks.filter((r) => r.level === "good");
    el.innerHTML = `<div class="grid">
      <div class="risk-sum">
        ${[["high", "High"], ["medium", "Medium"], ["low", "Low"], ["good", "Strengths"]].map(([l, t]) => `<div class="tile"><div class="k">${badge(l, t)}</div><div class="v">${cnt(l)}</div></div>`).join("")}
      </div>
      ${waiting ? `<div class="loading-line"><span class="spinner"></span>Still checking people and news — more items may appear.</div>` : ""}
      <div class="card"><h2>Things to look into</h2><p class="sub">Rule-based checks on public data, each with its evidence. These are prompts for your own research, not ratings or advice.</p>
        ${bad.length ? bad.map(row).join("") : '<div class="empty">No warning signs from these checks.</div>'}</div>
      ${good.length ? `<div class="card"><h2>Strengths</h2>${good.map(row).join("")}</div>` : ""}
      <div class="card"><h2>What this can't see</h2><p class="sub">Free public data has blind spots. Check these yourself before deciding anything:</p>
        <ul class="list" style="font-size:.9375rem">
          <li><b>Customers & suppliers.</b> Companies rarely name them. Read the annual report (“major customers”, “concentration”) and earnings-call transcripts.</li>
          <li><b>Promoter pledges.</b>${info("pledge")} Not in this free data. Check “Shareholding pattern → Encumbered shares” on the BSE/NSE filing.</li>
          <li><b>Related-party amounts.</b> Names are here; the rupee amounts are in the annual report notes.</li>
          <li><b>Court cases & contingent liabilities.</b>${info("contingent liabilities")} In the annual report notes and on e-Courts / NCLT cause lists.</li>
          <li><b>Credit-rating reasoning.</b>${info("credit rating")} Open the rating rationale links on the Overview tab.</li>
          <li><b>Name matching.</b> News for people uses name searches and can include someone with the same name.</li>
        </ul></div></div>`;
  }

  /* ------------------------------------------------------------------ Network graph */
  function buildElements() {
    const c = S.company, P = S.people, N = [], E = [], byKey = {};
    const self = norm(c.name), selfCin = P && P.cin;
    const node = (key, data) => {
      if (byKey[key]) { const n = byKey[key]; n.roles = [...new Set([...n.roles, ...data.roles])]; Object.assign(n.extra, data.extra); return key; }
      byKey[key] = { id: key, ...data, extra: data.extra || {} };
      N.push(byKey[key]);
      return key;
    };
    const edge = (a, b, label, group) => E.push({ id: `${a}->${b}:${label}`, source: a, target: b, label, group });
    const center = node("co:" + self, { label: shortName(c.name), type: "center", roles: ["center"], group: "center" });
    (c.holders || []).filter((h) => (h.latest || 0) >= 1).slice(0, 12).forEach((h) => {
      const k = node("co:" + norm(h.name), { label: shortName(h.name), type: "holder", roles: ["holder"], group: "owners", size: h.latest, extra: { holder: h } });
      if (k !== center) edge(k, center, h.latest.toFixed(1) + "%", "owners");
    });
    ((c.related_parties && c.related_parties.parties) || []).filter((p) => !/^others?$/i.test(p.name)).slice(0, 14).forEach((p) => {
      const k = node("co:" + norm(p.name), { label: shortName(p.name), type: "related", roles: ["related"], group: "related", extra: { rp: p } });
      if (k !== center) edge(center, k, p.relation || "related", "related");
    });
    (c.peers || []).filter((p) => p.path !== c.path).slice(0, 7).forEach((p) => {
      const k = node("co:" + norm(p.name), { label: p.name, type: "peer", roles: ["peer"], group: "peers", extra: { peer: p } });
      if (k !== center) edge(center, k, "peer", "peers");
    });
    if (P && P.found) {
      const counts = {};
      P.directors.forEach((d) => (d.current || []).forEach((x) => { counts[x.cin] = (counts[x.cin] || 0) + 1; }));
      P.directors.forEach((d) => {
        const pk = node("p:" + d.din, { label: tc(d.name), type: "person", roles: ["person"], group: "people", key: isKey(d.designation), extra: { person: d } });
        edge(pk, center, d.designation || "director", "people");
        (d.current || []).forEach((x) => {
          if (x.cin === selfCin) return;
          const strong = x.listed || counts[x.cin] >= 2;
          const existing = byKey["co:" + norm(x.name)];
          if (!strong && !existing && !S.net.allLinks) return;
          const k = node("co:" + norm(x.name), { label: tc(shortName(x.name)), type: "linked", roles: ["linked"], group: "links", extra: { linked: x } });
          if (k !== center) edge(pk, k, x.designation || "", existing ? existing.group : "links");
        });
      });
    }
    return { nodes: N, edges: E };
  }

  function nodeColor(n) {
    const t = n.roles.includes("center") ? "--n-company" : n.roles.includes("holder") ? "--n-holder" : n.roles.includes("person") ? "--n-person"
      : n.roles.includes("related") ? "--n-related" : n.roles.includes("peer") ? "--n-peer" : "--n-linked";
    return cssVar(t);
  }

  function tabNetwork(el, isRefresh) {
    if (isRefresh && S.cy) { drawGraph(); return; }
    const t = (k, label, color) => `<button class="toggle" data-net="${k}" aria-pressed="${S.net[k]}"><span class="dot" style="background:var(${color})"></span>${label}</button>`;
    el.innerHTML = `<div class="card net-card">
      <div class="net-tools">
        ${t("owners", "Owners", "--n-holder")}${t("related", "Related parties", "--n-related")}${t("people", "People", "--n-person")}${t("links", "Their other companies", "--n-linked")}${t("peers", "Peers", "--n-peer")}
        <button class="toggle" data-net="allLinks" aria-pressed="${S.net.allLinks}" title="By default only listed companies and companies shared by 2+ directors are shown">Show every board link</button>
      </div>
      <div id="cy" role="img" aria-label="Network of the company, its owners, people, related parties and peers"></div>
      <div class="net-hint">${S.people ? "Tap any dot for details · drag to rearrange · scroll to zoom" : "Loading directors — people will appear shortly…"}</div>
    </div>
    <p class="sub" style="margin-top:10px">Sized by importance. Owners point to the company with their stake. People link to the other companies where they're directors — the grey dots show who else this leadership is tied to.</p>`;
    $$("[data-net]", el).forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.net;
      S.net[k] = !S.net[k];
      b.setAttribute("aria-pressed", S.net[k]);
      if (k === "allLinks") drawGraph(); else applyFilters(true);
    }));
    drawGraph();
  }

  function drawGraph() {
    const box = $("#cy");
    if (!box || typeof cytoscape === "undefined") { if (box) box.innerHTML = '<div class="empty">Graph library failed to load (needs internet once).</div>'; return; }
    const { nodes, edges } = buildElements();
    const els = [
      ...nodes.map((n) => ({ data: { id: n.id, label: n.label, color: nodeColor(n), w: n.type === "center" ? 58 : n.type === "holder" ? Math.min(46, 20 + Math.sqrt(n.size || 1) * 3.4) : n.key ? 30 : n.type === "person" ? 24 : 18, group: n.group, shape: n.roles.includes("person") ? "ellipse" : "round-rectangle" }, classes: n.type })),
      ...edges.map((e) => ({ data: e, classes: e.group })),
    ];
    const hint = $(".net-hint");
    if (hint && S.people) hint.textContent = "Tap any dot for details · drag to rearrange · scroll to zoom";
    S.nodes = Object.fromEntries(nodes.map((n) => [n.id, n]));
    if (S.cy) S.cy.destroy();
    S.cy = cytoscape({ container: box, elements: els, wheelSensitivity: 0.25, minZoom: 0.2, maxZoom: 3, boxSelectionEnabled: false });
    styleGraph();
    applyFilters(false);
    S.cy.on("tap", "node", (e) => openNode(S.nodes[e.target.id()]));
    S.cy.on("tap", (e) => { if (e.target === S.cy) closeSheet(); });
    S.cy.on("mouseover", "node", (e) => {
      const nb = e.target.closedNeighborhood();
      S.cy.elements().not(nb).addClass("dim");
      nb.addClass("hl");
      box.style.cursor = "pointer";
    });
    S.cy.on("mouseout", "node", () => { S.cy.elements().removeClass("dim hl"); box.style.cursor = ""; });
  }

  function styleGraph() {
    if (!S.cy) return;
    const text = cssVar("--text"), text2 = cssVar("--text-2"), surface = cssVar("--surface"), sep = cssVar("--sep");
    S.cy.style([
      { selector: "node", style: {
        "background-color": "data(color)", width: "data(w)", height: "data(w)", shape: "data(shape)",
        label: "data(label)", "font-family": "-apple-system, Segoe UI, system-ui, sans-serif", "font-size": 10, color: text2,
        "text-valign": "bottom", "text-margin-y": 5, "text-wrap": "ellipsis", "text-max-width": 120,
        "text-background-color": surface, "text-background-opacity": 0.75, "text-background-padding": 2, "text-background-shape": "roundrectangle",
        "border-width": 2, "border-color": surface, "transition-property": "opacity", "transition-duration": 150,
      } },
      { selector: "node.center", style: { "font-size": 13, "font-weight": 600, color: text, "border-width": 4 } },
      { selector: "node.person", style: { "font-size": 10.5, color: text } },
      { selector: "node.holder", style: { color: text } },
      // Minor nodes only show their names once you zoom in (keeps the overview readable).
      { selector: "node.linked, node.related, node.peer", style: { "min-zoomed-font-size": 9, "font-size": 9 } },
      { selector: "edge", style: {
        width: 1.2, "line-color": sep, "curve-style": "bezier", "target-arrow-shape": "none",
        label: "", "font-size": 9, color: text2, "text-rotation": "autorotate",
        "text-background-color": surface, "text-background-opacity": 0.85, "text-background-padding": 1.5,
        "transition-property": "opacity", "transition-duration": 150,
      } },
      { selector: "edge.owners", style: { label: "data(label)", "line-color": cssVar("--n-holder"), opacity: 0.55, width: 1.6, "target-arrow-shape": "triangle", "target-arrow-color": cssVar("--n-holder"), "arrow-scale": 0.7 } },
      { selector: "edge.related", style: { "line-color": cssVar("--n-related"), opacity: 0.45 } },
      { selector: "edge.people", style: { "line-color": cssVar("--n-person"), opacity: 0.5 } },
      { selector: ".dim", style: { opacity: 0.12 } },
      { selector: "edge.hl", style: { label: "data(label)", opacity: 1, width: 2 } },
      { selector: "node.hl", style: { color: text } },
    ]);
  }

  function applyFilters(relayout) {
    const cy = S.cy;
    if (!cy) return;
    const on = { center: true, owners: S.net.owners, related: S.net.related, peers: S.net.peers, people: S.net.people, links: S.net.links && S.net.people };
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const node = S.nodes[n.id()];
        // A node stays visible if any of its roles is switched on.
        const vis = node.roles.some((r) => on[{ center: "center", holder: "owners", related: "related", peer: "peers", person: "people", linked: "links" }[r]]);
        n.style("display", vis ? "element" : "none");
      });
      cy.edges().forEach((e) => e.style("display", on[e.data("group")] !== false && e.source().style("display") !== "none" && e.target().style("display") !== "none" ? "element" : "none"));
    });
    const visible = cy.elements(":visible");
    // Radial: company in the middle, direct relationships on the inner ring, board links outside.
    // Inner ring is ordered by type so colours cluster into readable arcs.
    const ringOrder = { holder: 0, related: 1, person: 2, peer: 3 };
    const inner = visible.nodes().filter((n) => !n.hasClass("center") && !n.hasClass("linked"))
      .sort((a, b) => (ringOrder[S.nodes[a.id()].type] ?? 9) - (ringOrder[S.nodes[b.id()].type] ?? 9));
    const outer = visible.nodes().filter((n) => n.hasClass("linked"));
    const box = cy.container().getBoundingClientRect();
    const cx = box.width / 2, cyy = box.height / 2 + 16;
    const r1 = Math.max(150, inner.length * 9), r2 = r1 + Math.max(120, outer.length * 3.2);
    const pos = {};
    const center = visible.nodes(".center");
    center.forEach((n) => (pos[n.id()] = { x: cx, y: cyy }));
    inner.forEach((n, i) => {
      const a = (i / Math.max(1, inner.length)) * 2 * Math.PI - Math.PI / 2;
      pos[n.id()] = { x: cx + r1 * Math.cos(a), y: cyy + r1 * Math.sin(a) };
    });
    // Each outer node sits at the average angle of the people it connects to, then gets spread out.
    const angleOf = (id) => Math.atan2(pos[id].y - cyy, pos[id].x - cx);
    const outerA = outer.map((n) => {
      const nb = n.neighborhood("node").filter((m) => pos[m.id()] && !m.hasClass("center"));
      let sx = 0, sy = 0;
      nb.forEach((m) => { const a = angleOf(m.id()); sx += Math.cos(a); sy += Math.sin(a); });
      return { n, a: nb.length ? Math.atan2(sy, sx) : 0 };
    }).sort((p, q) => p.a - q.a);
    const minGap = (2 * Math.PI) / Math.max(outerA.length, 1);
    outerA.forEach((o, i) => {
      // blend ideal angle with an even spread so nodes never stack
      const even = outerA[0] ? outerA[0].a + i * minGap : 0;
      const a = outerA.length > 24 ? even : o.a * 0.5 + even * 0.5;
      const rr = r2 + (i % 2) * 34;
      pos[o.n.id()] = { x: cx + rr * Math.cos(a), y: cyy + rr * Math.sin(a) };
    });
    visible.layout({
      name: "preset", positions: (n) => pos[n.id()] || { x: cx, y: cyy }, fit: true, padding: 40,
      animate: !reduced() && relayout, animationDuration: 420, animationEasing: "ease-out",
    }).run();
  }

  /* ------------------------------------------------------------------ Node constructors (used by tables too) */
  function holderNode(h) { return { id: "co:" + norm(h.name), label: shortName(h.name), roles: ["holder"], extra: { holder: h } }; }
  function rpNode(p) { return { id: "co:" + norm(p.name), label: shortName(p.name), roles: ["related"], extra: { rp: p } }; }
  function peerNode(p) { return { id: "co:" + norm(p.name), label: p.name, roles: ["peer"], extra: { peer: p } }; }
  function personNode(d) { return { id: "p:" + d.din, label: tc(d.name), roles: ["person"], extra: { person: d } }; }
  function linkedNode(x) { return { id: "co:" + norm(x.name), label: tc(shortName(x.name)), roles: ["linked"], extra: { linked: x } }; }

  /* ------------------------------------------------------------------ Sheet (non-blocking side panel) */
  const sheet = $("#sheet");
  let sheetTok = 0, sheetOpen = false;
  const mobile = () => matchMedia("(max-width: 640px)").matches;
  const closedPos = () => (mobile() ? sheet.offsetHeight + 16 : sheet.offsetWidth + 24);
  const sheetSpring = spring((x) => {
    sheet.style.transform = mobile() ? `translateY(${x}px)` : `translateX(${x}px)`;
    // materialize: fade with distance from the open position
    sheet.style.opacity = String(Math.max(0, 1 - Math.max(0, x) / closedPos() * 0.6));
  }, 2000);
  function openSheet(title, html) {
    $("#sheet-title").textContent = title;
    $("#sheet-body").innerHTML = html;
    $("#sheet-body").scrollTop = 0;
    sheet.setAttribute("aria-hidden", "false");
    if (!sheetOpen) { if (sheetSpring.x > closedPos()) sheetSpring.set(closedPos()); }
    sheetOpen = true;
    sheetSpring.to(0, { response: 0.35, damping: 1 });
  }
  function closeSheet(velocity) {
    if (!sheetOpen) return;
    sheetOpen = false;
    sheet.setAttribute("aria-hidden", "true");
    sheetSpring.to(closedPos(), { response: 0.35, damping: 1, velocity });
    sheetTok++;
  }
  $("#sheet-close").addEventListener("click", () => closeSheet());
  // Drag to dismiss: 1:1 tracking, rubber-band past the open edge, momentum projection on release.
  (function () {
    const head = $("#sheet-head");
    let start = null, hist = [];
    head.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      head.setPointerCapture(e.pointerId);
      cancelAnimationFrame(sheetSpring.raf); sheetSpring.raf = 0;
      start = { p: mobile() ? e.clientY : e.clientX, x: sheetSpring.x };
      hist = [{ t: performance.now(), p: start.p }];
    });
    head.addEventListener("pointermove", (e) => {
      if (!start) return;
      const p = mobile() ? e.clientY : e.clientX;
      let x = start.x + (p - start.p);
      if (x < 0) x = rubber(x, closedPos());
      sheetSpring.set(x);
      hist.push({ t: performance.now(), p });
      if (hist.length > 6) hist.shift();
    });
    const end = () => {
      if (!start) return;
      const a = hist[0], b = hist[hist.length - 1];
      const v = b.t > a.t ? ((b.p - a.p) / (b.t - a.t)) * 1000 : 0;
      start = null;
      const landing = sheetSpring.x + project(v);
      if (landing > closedPos() / 2) closeSheet(v);
      else sheetSpring.to(0, { velocity: v, damping: 0.85, response: 0.35 });
    };
    head.addEventListener("pointerup", end);
    head.addEventListener("pointercancel", end);
  })();

  async function openNode(n) {
    if (!n) return;
    const tok = ++sheetTok;
    const c = S.company, ex = n.extra || {}, parts = [];
    const roleBadges = n.roles.map((r) => ({ center: "This company", holder: "Shareholder", related: "Related party", peer: "Peer", person: "Person", linked: "Board link" }[r]))
      .map((t) => `<span class="pill">${t}</span>`).join(" ");
    parts.push(`<div class="tagrow" style="margin-bottom:10px">${roleBadges}</div>`);

    if (n.roles.includes("center")) {
      parts.push(`<p class="muted">${esc(c.about)}</p>`);
    }
    if (ex.holder) {
      const h = ex.holder, s = h.series.slice(-6);
      parts.push(`<div class="section-title" style="font-size:1rem;margin-top:6px">Stake in ${esc(shortName(c.name))}</div>
        <dl class="kv"><dt>Type</dt><dd>${esc(h.category)}</dd><dt>Latest (${esc(h.latest_period)})</dt><dd><b>${h.latest.toFixed(2)}%</b></dd>
        ${s.map((p) => `<dt class="faint">${esc(p.period)}</dt><dd>${p.value != null ? p.value.toFixed(2) + "%" : "—"}</dd>`).join("")}</dl>`);
    }
    if (ex.rp) {
      parts.push(`<div class="section-title" style="font-size:1rem">Dealings with ${esc(shortName(c.name))}</div>
        <p class="muted" style="margin:4px 0">Relationship: <b style="color:var(--text)">${esc(ex.rp.relation || "—")}</b></p>
        <ul class="list" style="font-size:.875rem">${ex.rp.transactions.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        <p class="faint" style="font-size:.75rem">Amounts are in the annual report's related-party note.</p>`);
    }
    if (ex.peer) {
      const p = ex.peer;
      parts.push(`<dl class="kv">${Object.entries(p).filter(([k]) => !["name", "path"].includes(k)).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${inr(v, 2)}</dd>`).join("")}</dl>`);
    }
    if (ex.person) {
      const d = ex.person, cur = (d.current || []).filter((x) => !S.people || x.cin !== S.people.cin);
      parts.push(`<dl class="kv"><dt>Role here</dt><dd>${esc(d.designation || "—")}</dd><dt>Appointed</dt><dd>${esc(d.appointed || "—")}</dd><dt>DIN${info("din")}</dt><dd class="num">${esc(d.din)}</dd>
        <dt>Current boards</dt><dd>${(d.current || []).length}</dd><dt>Past roles</dt><dd>${(d.past || []).length}</dd></dl>
        ${d.about ? `<p class="faint" style="font-size:.8125rem">${esc(d.about)}</p>` : ""}
        <div class="section-title" style="font-size:1rem;margin-top:10px">Other companies they direct</div>
        <ul class="list co-list" style="max-height:none">${cur.map((x, i) => `<li><a href="#" class="nm" data-lk="${i}">${esc(tc(x.name))}</a><span class="faint" style="flex:none">${x.listed ? "Listed" : esc((x.type || "").replace(" company", ""))}</span></li>`).join("") || '<li class="muted">None</li>'}</ul>
        ${(d.past || []).length ? `<details style="margin-top:8px"><summary class="muted" style="cursor:pointer;font-size:.875rem">Past roles (${d.past.length})</summary><ul class="list co-list" style="max-height:none">${d.past.map((x) => `<li><span class="nm">${esc(tc(x.name))}</span><span class="faint" style="flex:none">${esc(x.ceased ? "left " + x.ceased : "")}</span></li>`).join("")}</ul></details>` : ""}`);
    }
    parts.push(`<div id="sh-entity"></div><div class="btn-row" id="sh-actions"></div><div id="sh-news"></div>`);
    openSheet(n.label, parts.join(""));
    const body = $("#sheet-body");
    if (ex.person) $$("[data-lk]", body).forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const cur = ex.person.current.filter((x) => !S.people || x.cin !== S.people.cin);
      openNode(linkedNode(cur[+a.dataset.lk]));
    }));

    const actions = $("#sh-actions");
    const addBtn = (html) => actions.insertAdjacentHTML("beforeend", html);
    if (ex.person) addBtn(`<a class="btn secondary" href="${esc(ex.person.url)}" target="_blank" rel="noopener">MCA record ${ICON.ext}</a>`);

    // Registry profile for companies known by CIN (board links)
    if (ex.linked && ex.linked.url) {
      $("#sh-entity").innerHTML = `<div class="loading-line"><span class="spinner"></span>Checking the company registry…</div>`;
      api("/api/entity", { url: ex.linked.url }).then((p) => {
        if (tok !== sheetTok) return;
        const ok = p.status && /^active$/i.test(p.status);
        $("#sh-entity").innerHTML = `<dl class="kv">
          <dt>Status</dt><dd>${p.status ? badge(ok ? "good" : "high", p.status) : "—"}</dd>
          <dt>Type</dt><dd>${esc(p.type || "—")}${p.listed ? " · Listed" : ""}</dd><dt>Incorporated</dt><dd>${esc(p.founded || "—")}</dd>
          <dt>Paid-up capital</dt><dd>${p.paid_up_capital ? "₹" + inr(p.paid_up_capital / 1e7, 2) + " Cr" : "—"}</dd>
          <dt>Last balance sheet</dt><dd>${esc(p.last_balance_sheet || "—")}</dd><dt>Directors</dt><dd>${(p.directors || []).length}</dd>
          ${p.activity ? `<dt>Activity</dt><dd style="text-align:right">${esc(p.activity)}</dd>` : ""}</dl>
          ${(p.directors || []).length ? `<p class="faint" style="font-size:.8125rem">Board: ${p.directors.map((d) => esc(tc(d.name))).join(", ")}</p>` : ""}`;
        addBtn(`<a class="btn secondary" href="${esc(p.url)}" target="_blank" rel="noopener">MCA record ${ICON.ext}</a>`);
        if (p.screener) addBtn(`<button class="btn" data-analyse="${esc(p.screener.path)}">Analyse ${esc(shortName(p.screener.name))}</button>`);
        wireAnalyse();
      }).catch((e) => { if (tok === sheetTok) $("#sh-entity").innerHTML = `<p class="err">${esc(e.message)}</p>`; });
    }

    // Listed? offer full analysis
    if (ex.peer && ex.peer.path !== c.path) addBtn(`<button class="btn" data-analyse="${esc(ex.peer.path)}">Analyse ${esc(ex.peer.name)}</button>`);
    else if (!ex.person && !ex.linked && !n.roles.includes("center")) {
      api("/api/match", { name: n.label }).then((m) => {
        if (tok !== sheetTok || !m || m.path === c.path) return;
        addBtn(`<button class="btn" data-analyse="${esc(m.path)}">Analyse ${esc(shortName(m.name))}</button>`);
        wireAnalyse();
      }).catch(() => {});
    }
    wireAnalyse();

    // News about this entity
    if (!n.roles.includes("center")) {
      const name = ex.person ? tc(ex.person.name) : n.label;
      const cachedKey = ex.person ? "p:" + ex.person.din : null;
      const box = $("#sh-news");
      const show = (items) => {
        if (tok !== sheetTok) return;
        const fl = items.filter((i) => i.risk >= 2).length;
        box.innerHTML = `<div class="section-title" style="font-size:1rem;margin-top:14px">In the news ${fl ? badge(items.some((i) => i.risk === 3) ? "high" : "medium", fl + " flagged") : items.length ? badge("good", "Nothing flagged") : ""}</div>
          ${items.slice(0, 10).map((x) => `<div class="news-item" style="padding:10px 0"><div class="when">${ago(x.ts)}</div><div style="min-width:0"><a href="${esc(x.link)}" target="_blank" rel="noopener" style="font-size:.875rem">${esc(x.title)}</a><div class="meta">${esc(x.source)} ${x.tags.map((t) => badge(t.severity, t.label)).join("")}</div></div></div>`).join("") || '<p class="muted" style="font-size:.875rem">No headlines in the last year.</p>'}`;
      };
      if (cachedKey && S.news[cachedKey] && !S.news[cachedKey].loading) show(S.news[cachedKey].items);
      else {
        box.innerHTML = `<div class="loading-line" style="margin-top:14px"><span class="spinner"></span>Searching news…</div>`;
        api("/api/news", { q: `"${name}"` }).then(show).catch(() => { if (tok === sheetTok) box.innerHTML = ""; });
      }
    }
  }
  function wireAnalyse() {
    $$("[data-analyse]", $("#sheet-body")).forEach((b) => { b.onclick = () => go(b.dataset.analyse); });
  }

  // Shared with pro.js (portfolio, custom screener, financials, fair value…), which calls SL.start() once loaded.
  window.SL = { $, $$, esc, api, inr, info, store, shortName, signed, tone, scoreBar, go, watched, refresh, Tech, S, SCR, screenAdd, UNIVERSE, TABS, PAGES, XTABS, HOOKS, ICON, pending, start: route };
})();
