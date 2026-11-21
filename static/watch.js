/* Watchlist: the companies you follow, with the live price, today's change and an optional price target.
   Shown on Home (3 rows, then "Show more") and on its own page (#/watchlist).
   Targets: saved in this browser ("sl-targets"). When a price reaches a target you get a notification:
   on the PC while Stock Lens is open, and on the phone app even when it is closed (its own background check). */
(function () {
  "use strict";
  const { $, $$, esc, api, inr, store, shortName, go, SCR, PAGES, EXAMPLES } = window.SL;
  const NATIVE = window.StockLensApp || null; // only inside the Android app

  const Q = {}; // symbol -> { price, change_pct } | { error }
  const W = { edit: false, adding: false, more: false, editing: null,
    sort: (() => { try { const s = localStorage.getItem("sl-wsort"); return s === "health" ? "mine" : s || "mine"; } catch (e) { return "mine"; } })() };
  const mounts = new Map();

  // NSE symbol from the Screener path (/company/TCS/consolidated/). Number-only codes are BSE-only companies.
  const symOf = (w) => {
    const r = SCR.rows.get(w.path);
    if (r && r.sym && !/^\d+\.BO$/.test(r.sym)) return r.sym;
    const seg = (w.path.split("/")[2] || "").toUpperCase();
    return seg && !/^\d+$/.test(seg) ? seg + ".NS" : null;
  };

  /* ---------------------------------------------------------------- targets */
  const targets = () => { try { return JSON.parse(localStorage.getItem("sl-targets")) || {}; } catch (e) { return {}; } };
  function saveTargets(t) {
    try { localStorage.setItem("sl-targets", JSON.stringify(t)); } catch (e) {}
    syncNative(t);
  }
  function syncNative(t = targets()) {
    if (!NATIVE) return;
    const list = store.get("sl-watch").filter((w) => t[w.path]).map((w) => ({ path: w.path, name: shortName(w.name), sym: symOf(w), ...t[w.path] }));
    try { NATIVE.setTargets(JSON.stringify(list)); } catch (e) {}
    // The home-screen widget shows the watchlist: hand it the names, links and price symbols.
    const watch = store.get("sl-watch").map((w) => ({ path: w.path, name: shortName(w.name), sym: symOf(w) }));
    try { if (NATIVE.setWatchlist) NATIVE.setWatchlist(JSON.stringify(watch)); } catch (e) {}
  }
  // The phone's background check may have fired while the app was closed: copy those hits in.
  function pullNativeHits() {
    if (!NATIVE || !NATIVE.getTargets) return;
    try {
      const t = targets(); let changed = false;
      for (const x of JSON.parse(NATIVE.getTargets() || "[]")) {
        if (x.hit && t[x.path] && !t[x.path].hit && t[x.path].target === x.target) { Object.assign(t[x.path], { hit: true, hitAt: x.hitAt, hitPrice: x.hitPrice }); changed = true; }
      }
      if (changed) try { localStorage.setItem("sl-targets", JSON.stringify(t)); } catch (e) {}
    } catch (e) {}
  }
  function notify(title, body, path) {
    if (NATIVE) { try { NATIVE.notify(title, body, path || ""); } catch (e) {} return; }
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification(title, { body, tag: "sl-" + path });
      n.onclick = () => { focus(); if (path) go(path); n.close(); };
    }
  }
  function askPermission() {
    if (NATIVE) { try { NATIVE.askNotify(); } catch (e) {} return; }
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  }
  function checkHits() {
    const t = targets(); let changed = false;
    for (const w of store.get("sl-watch")) {
      const g = t[w.path], q = Q[symOf(w)];
      if (!g || g.hit || !q || q.price == null) continue;
      if (g.dir === "up" ? q.price >= g.target : q.price <= g.target) {
        Object.assign(g, { hit: true, hitAt: Date.now(), hitPrice: q.price });
        changed = true;
        notify(`${shortName(w.name)} reached your target`, `Now ₹${inr(q.price, 2)} — your target was ₹${inr(g.target, 2)} (${g.dir === "up" ? "rise to" : "fall to"}).`, w.path);
      }
    }
    if (changed) saveTargets(t);
  }

  /* ---------------------------------------------------------------- live prices */
  let qTimer = 0, qBusy = false;
  async function refreshQuotes() {
    const syms = [...new Set(store.get("sl-watch").map(symOf).filter(Boolean))];
    if (!syms.length || qBusy) return;
    qBusy = true;
    try { Object.assign(Q, await api("/api/quote", { symbols: syms.join(",") })); } catch (e) {}
    qBusy = false;
    checkHits();
    drawAll();
  }
  function startQuotes() {
    clearInterval(qTimer);
    refreshQuotes();
    qTimer = setInterval(() => { if (!document.hidden && [...mounts.keys()].some((b) => document.body.contains(b))) refreshQuotes(); }, 60000);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { pullNativeHits(); refreshQuotes(); } });

  /* ---------------------------------------------------------------- drawing */
  const pct = (v) => (v == null ? "" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`);
  const money = (v) => "₹" + inr(v, v < 100 ? 2 : v < 1000 ? 1 : 0);

  function rows() {
    const list = store.get("sl-watch").map((w, i) => ({ w, i, q: Q[symOf(w)] }));
    if (W.sort === "name") list.sort((a, b) => shortName(a.w.name).localeCompare(shortName(b.w.name)));
    if (W.sort === "day") list.sort((a, b) => ((b.q && b.q.change_pct) ?? -1e9) - ((a.q && a.q.change_pct) ?? -1e9));
    return list;
  }

  // Normal view: a plain status line, only when a target exists. Edit view: a button to set or change it.
  function targetLine(w, q, g, editable) {
    const tag = (cls, text) => editable ? `<button class="w-tgt-btn ${cls}" data-tgt="${esc(w.path)}">${text}</button>` : `<div class="w-tgt-btn ${cls}">${text}</div>`;
    if (!g) return editable ? tag("add", "+ Set target") : "";
    if (g.hit) return tag("hit", `Target ${money(g.target)} reached`);
    const away = q && q.price ? Math.abs(g.target / q.price - 1) * 100 : null;
    return tag("set", `Target ${money(g.target)} ${g.dir === "up" ? "↑" : "↓"}${away != null ? ` · ${away.toFixed(1)}% away` : ""}`);
  }

  function editor(w, q, g) {
    const now = q && q.price;
    return `<div class="w-edit" data-for="${esc(w.path)}">
      <label>Notify me when ${esc(shortName(w.name))} reaches</label>
      <div class="w-edit-row"><span class="w-rs">₹</span><input type="number" inputmode="decimal" step="any" min="0" value="${g ? g.target : now ? +now.toFixed(2) : ""}" aria-label="Target price in rupees">
        <button class="btn" data-tsave>Save</button>${g ? `<button class="btn secondary" data-tclear>Remove</button>` : ""}<button class="linkish" data-tcancel>Cancel</button></div>
      <div class="w-edit-hint"><span data-thint></span></div>
    </div>`;
  }

  function rowHtml({ w, q }, t) {
    const g = t[w.path];
    const right = W.edit
      ? `<button class="w-del" data-del="${esc(w.path)}" aria-label="Remove ${esc(shortName(w.name))}">Remove</button>`
      : q && q.price != null
        ? `<div class="w-px"><b class="num">${money(q.price)}</b><span class="w-chg ${q.change_pct > 0 ? "up" : q.change_pct < 0 ? "down" : ""}">${pct(q.change_pct)}</span></div>`
        : q && q.error ? `<div class="w-px"><span class="faint">No price</span></div>`
        : `<div class="w-px"><span class="skel" style="width:64px;height:15px;display:block"></span><span class="skel" style="width:58px;height:20px;display:block"></span></div>`;
    return `<li class="w-row${g && g.hit ? " is-hit" : ""}" data-go="${esc(w.path)}" tabindex="0">
        <div class="w-main"><div class="w-name">${esc(shortName(w.name))}</div>${targetLine(w, q, g, W.edit)}</div>
        <div class="w-right">${right}</div></li>
      ${W.editing === w.path && W.edit ? `<li class="w-edit-li">${editor(w, q, g)}</li>` : ""}`;
  }

  function draw(box, opt) {
    if (!document.body.contains(box)) { mounts.delete(box); return; }
    if (box.contains(document.activeElement) && (document.activeElement.matches(".w-edit input") || $(".w-add .results:not(.hidden)", box))) return; // don't disturb typing
    const watch = store.get("sl-watch"), t = targets();
    const list = rows();
    const limit = opt.page || W.edit || W.more ? Infinity : opt.limit || 3;
    let shown = list.slice(0, limit);
    if (W.editing && !shown.some((x) => x.w.path === W.editing)) shown = list; // keep the open target editor visible
    const sortBtn = (k, l) => `<button class="${W.sort === k ? "on" : ""}" data-ws="${k}">${l}</button>`;
    box.innerHTML = `
      <div class="w-head">
        <h2>${opt.page ? "Watchlist" : `<a href="#/watchlist" class="w-title">Watchlist</a>`}</h2>
        <div class="w-acts">
          ${!W.edit ? `<button class="linkish" data-wadd>${W.adding ? "Close" : "+ Add"}</button>` : ""}
          ${watch.length ? `<button class="linkish" data-wedit>${W.edit ? "Done" : "Edit"}</button>` : ""}
        </div>
      </div>
      ${W.adding || !watch.length ? `<div class="w-add">
        <div class="w-add-in"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <input type="search" placeholder="Search a company to add" autocomplete="off" spellcheck="false" aria-label="Search a company to add to your watchlist"></div>
        <div class="results hidden" role="listbox"></div>
      </div>` : ""}
      ${watch.length > 1 && opt.page ? `<div class="w-sort" role="group" aria-label="Sort">${sortBtn("mine", "My order")}${sortBtn("day", "Today's move")}${sortBtn("name", "A–Z")}</div>` : ""}
      ${watch.length ? `<ul class="w-list">${shown.map((x) => rowHtml(x, t)).join("")}</ul>
        ${shown.length < list.length ? `<button class="w-more" data-wmore>Show ${list.length - shown.length} more</button>`
          : W.more && !opt.page && list.length > (opt.limit || 3) ? `<button class="w-more" data-wless>Show less</button>` : ""}`
        : `<div class="w-try"><span class="faint">Popular:</span>${EXAMPLES.map(([n, p]) => `<button class="chip press" data-add="${esc(p)}" data-n="${esc(n)}">${esc(n)}</button>`).join("")}</div>`}`;

    $$(".w-row", box).forEach((li) => {
      li.addEventListener("click", (e) => { if (!e.target.closest("button") && !W.edit) go(li.dataset.go); });
      li.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === li) go(li.dataset.go); });
    });
    $$("[data-del]", box).forEach((b) => b.addEventListener("click", () => {
      store.set("sl-watch", store.get("sl-watch").filter((w) => w.path !== b.dataset.del));
      const tt = targets(); delete tt[b.dataset.del]; saveTargets(tt);
      if (!store.get("sl-watch").length) W.edit = false;
      drawAll();
    }));
    $$("[data-ws]", box).forEach((b) => b.addEventListener("click", () => { W.sort = b.dataset.ws; try { localStorage.setItem("sl-wsort", W.sort); } catch (e) {} drawAll(); }));
    const ed = $("[data-wedit]", box); if (ed) ed.addEventListener("click", () => { W.edit = !W.edit; W.editing = null; drawAll(); });
    const ad = $("[data-wadd]", box); if (ad) ad.addEventListener("click", () => { W.adding = !W.adding; drawAll(); if (W.adding) { const i = $(".w-add input", box); if (i) i.focus(); } });
    const mo = $("[data-wmore]", box); if (mo) mo.addEventListener("click", () => { W.more = true; drawAll(); });
    const le = $("[data-wless]", box); if (le) le.addEventListener("click", () => { W.more = false; drawAll(); });
    $$("[data-add]", box).forEach((b) => b.addEventListener("click", () => add(b.dataset.n, b.dataset.add)));
    $$("[data-tgt]", box).forEach((b) => b.addEventListener("click", () => { W.editing = W.editing === b.dataset.tgt ? null : b.dataset.tgt; drawAll(); const i = $(".w-edit input", box); if (i) { i.focus(); i.select(); } }));
    wireEditor(box);
    if ($(".w-add", box)) wireAdd(box);
  }

  function wireEditor(box) {
    const ed = $(".w-edit", box);
    if (!ed) return;
    const path = ed.dataset.for, inp = $("input", ed), hint = $("[data-thint]", ed);
    const w = store.get("sl-watch").find((x) => x.path === path), q = w && Q[symOf(w)];
    const say = () => {
      const v = parseFloat(inp.value);
      hint.textContent = !(v > 0) ? "Enter a price." : q && q.price ? `Now ${money(q.price)} · alert when it ${v >= q.price ? "rises" : "falls"} to ${money(v)}` : "";
    };
    inp.addEventListener("input", say); say();
    const save = () => {
      const v = parseFloat(inp.value);
      if (!(v > 0)) { inp.focus(); return; }
      const t = targets();
      t[path] = { target: +v.toFixed(2), dir: q && q.price && v < q.price ? "down" : "up", hit: false, setAt: Date.now() };
      W.editing = null; inp.blur();
      saveTargets(t);
      askPermission();
      checkHits();
      drawAll();
    };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { W.editing = null; inp.blur(); drawAll(); } });
    $("[data-tsave]", ed).addEventListener("click", save);
    const cl = $("[data-tclear]", ed); if (cl) cl.addEventListener("click", () => { const t = targets(); delete t[path]; W.editing = null; inp.blur(); saveTargets(t); drawAll(); });
    $("[data-tcancel]", ed).addEventListener("click", () => { W.editing = null; inp.blur(); drawAll(); });
  }

  function add(name, path) {
    const list = store.get("sl-watch");
    if (!list.some((w) => w.path === path)) store.set("sl-watch", [...list, { name, path }]);
    W.adding = false;
    drawAll();
    refreshQuotes();
  }

  function wireAdd(box) {
    const inp = $(".w-add input", box), res = $(".w-add .results", box);
    let t = 0, tok = 0;
    inp.addEventListener("input", () => {
      clearTimeout(t);
      const v = inp.value.trim();
      if (v.length < 2) { res.classList.add("hidden"); return; }
      const my = ++tok;
      t = setTimeout(async () => {
        try {
          const r = await api("/api/search", { q: v });
          if (my !== tok) return;
          res.innerHTML = r.slice(0, 6).map((x) => `<button data-p="${esc(x.path)}" data-n="${esc(x.name)}"><span>${esc(x.name)}</span>${SL.watched(x.path) ? '<span class="path">Added</span>' : ""}</button>`).join("") || `<div class="empty" style="padding:14px">No match</div>`;
          res.classList.remove("hidden");
        } catch (e) {}
      }, 150);
    });
    inp.addEventListener("keydown", (e) => { if (e.key === "Escape") { W.adding = false; inp.blur(); drawAll(); } });
    res.addEventListener("mousedown", (e) => e.preventDefault());
    res.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-p]");
      if (b) { res.classList.add("hidden"); inp.value = ""; inp.blur(); add(b.dataset.n, b.dataset.p); }
    });
    inp.addEventListener("blur", () => setTimeout(() => res.classList.add("hidden"), 150));
  }

  function drawAll() { for (const [box, opt] of [...mounts.entries()]) draw(box, opt); }

  function mount(box, opt = {}) {
    for (const b of [...mounts.keys()]) if (!document.body.contains(b)) mounts.delete(b);
    mounts.set(box, opt);
    W.edit = false; W.editing = null; W.adding = false; W.more = false;
    pullNativeHits();
    draw(box, opt);
    startQuotes();
  }

  PAGES["/watchlist"] = (view) => {
    document.title = "Watchlist · Stock Lens";
    let hasW = false;
    try { hasW = NATIVE && NATIVE.hasWidget && NATIVE.hasWidget(); } catch (e) {}
    view.innerHTML = `<div class="page-narrow"><section class="card fade-in" id="watch-page"></section>
      ${NATIVE && NATIVE.pinWidget && !hasW ? `<button class="w-pin" id="w-pin"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M17 14v6M14 17h6"/></svg>Add widget to home screen</button>` : ""}</div>`;
    const pin = document.getElementById("w-pin");
    if (pin) pin.addEventListener("click", () => { try { NATIVE.pinWidget(); } catch (e) {} });
    mount($("#watch-page"), { page: true });
  };

  window.Watch = { mount, sync: () => syncNative() };
  syncNative();
})();
