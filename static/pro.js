/* Stock Lens — extra tools: portfolio, custom screener, financials, three-way score,
   fair-value calculator, dividends and "what changed" on the watchlist. */
(function () {
  "use strict";
  const { $, $$, esc, api, inr, info, store, shortName, signed, tone, scoreBar, go, Tech, S, SCR, screenAdd, UNIVERSE, TABS, PAGES, XTABS, HOOKS, ICON } = SL;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const obj = (k) => { const v = store.get(k); return Array.isArray(v) ? {} : v; };
  const dateStr = (ms) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const rupee = (v, d = 0) => (v == null ? "—" : "₹" + inr(v, d));

  Object.assign(Glossary, {
    "allocation": ["Allocation", "How your money is split between holdings or industries. If one slice is very large, one piece of bad news can hurt the whole portfolio."],
    "gain": ["Gain / loss", "The difference between what your shares are worth today and what you paid. It is only on paper until you sell."],
    "avg buy": ["Average buy price", "The average price you paid per share. If you bought at different prices, add up the money spent and divide by the number of shares."],
    "quality score": ["Quality score", "Out of 100: how good the business itself is. It mixes returns on capital, growth, debt, cash and the trend score. It says nothing about whether the price is right."],
    "valuation score": ["Valuation score", "Out of 100: how cheap the share looks. It compares today's P/E with the company's own 5-year history, with its profit growth, and with similar companies. Higher means cheaper."],
    "momentum score": ["Momentum score", "Out of 100: how strong the share price has been lately — against its 200-day average, against the Nifty 50, and over the last 6 months. Strong prices often stay strong for a while, but not always."],
    "peg": ["PEG ratio", "P/E divided by the yearly profit growth rate. Around 1 means the price is in line with growth; well above 2 means you are paying a lot for that growth."],
    "fair value": ["Fair value", "An estimate of what a share is worth from the profit it should earn in future, brought back to today's money. It depends fully on the assumptions you put in, so treat it as a range, not a fact."],
    "required return": ["Required return", "The yearly return you want for taking the risk of owning this share. A common choice in India is 12%, a few points above a fixed deposit."],
    "exit pe": ["P/E after 10 years", "The P/E you expect the market to pay for this company ten years from now. Mature companies usually settle between 15 and 25."],
    "stock split": ["Share split / bonus", "The company cuts each share into more shares (for example 1 into 5). You own more shares at a lower price each; the total value does not change."],
    "dividend": ["Dividend", "Cash the company pays to shareholders out of its profit, per share."],
    "index": ["Index", "A list of companies picked by the stock exchange. The Nifty 50 is the 50 largest; the Nifty 500 covers the 500 largest, which is almost the whole market by value."],
    "sales": ["Sales", "All the money the company billed its customers in the period, before any costs."],
    "sales growth": ["Sales growth %", "How much sales rose or fell compared with the year before, in percent."],
    "revenue": ["Revenue", "For banks and lenders: interest and fees earned in the period, before any costs."],
    "expenses": ["Expenses", "The day-to-day costs of running the business: materials, salaries, rent, power and so on."],
    "other income": ["Other income", "Money earned outside the main business, such as interest on deposits or profit on selling an asset. A big number here can make profit look better than the business really is."],
    "interest": ["Interest", "What the company paid on its loans in the period."],
    "depreciation": ["Depreciation", "The yearly charge for wear and tear on machines, buildings and equipment. No cash goes out, but the assets will need replacing one day."],
    "profit before tax": ["Profit before tax", "Profit after all costs and interest, but before income tax."],
    "tax": ["Tax %", "Income tax as a percentage of profit before tax. A rate far below about 25% deserves a look at why."],
    "dividend payout": ["Dividend payout %", "The share of net profit paid out to shareholders as dividends. The rest is kept in the business."],
    "equity capital": ["Equity capital", "The face value of all shares issued. If this number rises, the company has issued new shares."],
    "reserves": ["Reserves", "Profits from past years that were kept in the business instead of being paid out. Together with equity capital this is the owners' money."],
    "borrowings": ["Borrowings", "All loans the company owes — to banks, bondholders and others."],
    "deposits": ["Deposits", "For banks: money that customers have kept with the bank. The bank owes it back to them."],
    "other liabilities": ["Other liabilities", "Money owed other than loans: unpaid supplier bills, advances from customers, taxes due and so on."],
    "total liabilities": ["Total liabilities", "Everything on the 'where the money came from' side: owners' money plus loans plus other dues. It always equals total assets."],
    "fixed assets": ["Fixed assets", "Long-lasting things the company owns to run the business: land, factories, machines, software."],
    "cwip": ["CWIP (capital work in progress)", "Factories or projects still being built. They cost money now but earn nothing until they are finished."],
    "investments": ["Investments", "Shares, mutual funds and bonds the company holds, including stakes in other companies."],
    "other assets": ["Other assets", "Mostly short-term items: stock of goods, money customers still owe, and cash in the bank."],
    "total assets": ["Total assets", "Everything the company owns or is owed, added up."],
    "cash from operating activity": ["Cash from operations", "Actual cash that came in from the main business in the year. Over time it should be close to net profit."],
    "cash from investing activity": ["Cash from investing", "Cash spent on (negative) or received from (positive) factories, machines and investments. Growing companies usually show a negative number."],
    "cash from financing activity": ["Cash from financing", "Cash raised from loans or new shares (positive), or paid out as loan repayments and dividends (negative)."],
    "net cash flow": ["Net cash flow", "The change in the company's cash balance over the year, after all three kinds of cash flow."],
    "free cash flow": ["Free cash flow", "Cash from operations minus money spent on factories and equipment. This is what is truly left over for shareholders and lenders."],
    "cfo/ebitda": ["CFO / EBITDA", "The share of operating profit that turned into real cash. Close to 100% is healthy."],
    "debtor days": ["Debtor days", "How many days, on average, customers take to pay their bills. A rising number means cash is getting stuck with customers."],
    "inventory days": ["Inventory days", "How many days of sales are sitting as unsold stock. A rising number can mean goods are not selling."],
    "days payable": ["Days payable", "How many days, on average, the company takes to pay its suppliers."],
    "cash conversion cycle": ["Cash conversion cycle", "Days between paying suppliers and collecting from customers. Lower is better; negative means customers pay before suppliers must be paid."],
    "working capital days": ["Working capital days", "How many days of sales are tied up in running the business day to day. Lower means the business needs less cash to grow."],
    "trend score": Glossary["piotroski"],
  });

  /* ---------- small shared pieces ---------- */
  function picker(input, res, onPick) {
    let t = 0;
    input.addEventListener("input", () => {
      clearTimeout(t);
      const val = input.value.trim();
      if (val.length < 2) return res.classList.add("hidden");
      t = setTimeout(async () => {
        try {
          const r = await api("/api/search", { q: val });
          res.innerHTML = r.slice(0, 8).map((x) => `<button data-p="${esc(x.path)}" data-n="${esc(x.name)}"><span>${esc(x.name)}</span></button>`).join("") || `<div class="empty" style="padding:14px">No match</div>`;
          res.classList.remove("hidden");
        } catch (e) {}
      }, 150);
    });
    res.addEventListener("pointerdown", (e) => {
      const b = e.target.closest("button[data-p]");
      if (b) { e.preventDefault(); res.classList.add("hidden"); onPick({ name: b.dataset.n, path: b.dataset.p }); }
    });
    input.addEventListener("blur", () => setTimeout(() => res.classList.add("hidden"), 120));
  }
  function download(name, rows) {
    const csv = "﻿" + rows.map((r) => r.map((v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  // Re-draw the open page when screen rows finish loading (at most twice a second).
  let live = null, liveTimer = 0;
  SCR.listeners.push(() => {
    if (!live || liveTimer) return;
    liveTimer = setTimeout(() => { liveTimer = 0; if (live) live(); }, 400);
  });
  const failedList = (sc) => sc.checks.filter((k) => k.status === "fail").map((k) => k.label.toLowerCase());

  /* ================================================================== Portfolio */
  const port = () => store.get("sl-port");
  PAGES["/portfolio"] = (view) => {
    document.title = "Portfolio · Stock Lens";
    let picked = null;
    view.innerHTML = `<div class="co-head fade-in"><div><h1>Portfolio</h1><p class="sub" style="margin:8px 0 0">Enter what you hold to see gain or loss, where the money sits, and warning signs. Saved only in this browser — nothing is sent anywhere.</p></div></div>
      <div class="grid"><div class="tiles" id="pf-tiles"></div>
      <div class="card"><h2>Holdings</h2>
        <form class="pf-form" id="pf-form"><span class="cmp-add"><input id="pf-q" type="search" placeholder="Company…" autocomplete="off" spellcheck="false" required><div class="results hidden" id="pf-res"></div></span>
          <input id="pf-qty" type="number" min="0" step="any" placeholder="Shares" required>
          <input id="pf-buy" type="number" min="0" step="any" placeholder="Avg buy price ₹" required>
          <button class="btn" type="submit">Add holding</button><span class="err" id="pf-err"></span></form>
        <div id="pf-table"></div></div>
      <div class="grid g2"><div class="card"><h2>Where the money sits${info("allocation")}</h2><p class="sub">Share of today's value by industry.</p><div id="pf-alloc"></div></div>
        <div class="card"><h2>Things to look at</h2><p class="sub">Simple rules on spread and business health. Prompts for your own thinking, not advice.</p><div id="pf-warn"></div></div></div></div>`;
    picker($("#pf-q"), $("#pf-res"), (x) => { picked = x; $("#pf-q").value = shortName(x.name); $("#pf-qty").focus(); });
    $("#pf-q").addEventListener("input", () => { picked = null; });
    $("#pf-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const qty = parseFloat($("#pf-qty").value), buy = parseFloat($("#pf-buy").value);
      if (!picked) { $("#pf-err").textContent = "Pick the company from the list that appears as you type."; return; }
      if (!(qty > 0) || !(buy > 0)) { $("#pf-err").textContent = "Shares and buy price must be above zero."; return; }
      $("#pf-err").textContent = "";
      const list = port().filter((h) => h.path !== picked.path);
      const old = port().find((h) => h.path === picked.path);
      // Same company again: merge into one holding with the averaged price.
      const q2 = old ? old.qty + qty : qty, b2 = old ? (old.qty * old.buy + qty * buy) / q2 : buy;
      store.set("sl-port", [...list, { name: picked.name, path: picked.path, qty: q2, buy: b2 }]);
      picked = null; e.target.reset(); draw();
    });
    const draw = () => {
      if (!$("#pf-table")) return;
      const list = port();
      screenAdd(list.map((h) => h.path));
      const rows = list.map((h) => {
        const r = SCR.rows.get(h.path) || {}, price = r.score ? r.score.m.price : null;
        const inv = h.qty * h.buy, val = price != null ? h.qty * price : null;
        return { h, r, price, inv, val, gain: val != null ? val - inv : null };
      });
      const ready = rows.filter((x) => x.val != null);
      const inv = ready.reduce((a, x) => a + x.inv, 0), val = ready.reduce((a, x) => a + x.val, 0), gain = val - inv;
      const tile = (k, v, cls, h) => `<div class="tile"><div class="k">${k}</div><div class="v ${cls || ""}">${v}</div>${h ? `<div class="h">${h}</div>` : ""}</div>`;
      $("#pf-tiles").innerHTML = tile("Money put in", rupee(inv)) + tile("Worth today", rupee(val)) +
        tile("Gain / loss" + info("gain"), (gain > 0 ? "+" : "") + rupee(gain).replace("₹-", "−₹"), tone(gain), inv ? signed((gain / inv) * 100) : "") + tile("Holdings", String(list.length));
      $("#pf-table").innerHTML = list.length ? `<div class="scroll-x"><table class="t"><thead><tr><th>Company</th><th>Shares</th><th>Avg buy ₹${info("avg buy")}</th><th>Price now ₹</th><th>Put in ₹</th><th>Worth ₹</th><th>Gain ₹</th><th>Gain %</th><th>Weight</th><th>Health${info("health check")}</th><th></th></tr></thead><tbody>
        ${rows.map(({ h, r, price, inv: i, val: v, gain: g }, n) => `<tr><td><div class="co-cell"><a href="#/c${esc(r.go || h.path)}"><b>${esc(shortName(r.name && r.state === "ok" ? r.name : h.name))}</b></a><span class="faint">${esc(r.industry || "")}</span></div></td>
          <td><input class="cell-in" data-edit="qty" data-n="${n}" type="number" min="0" step="any" value="${h.qty}" aria-label="Shares"></td>
          <td><input class="cell-in" data-edit="buy" data-n="${n}" type="number" min="0" step="any" value="${+h.buy.toFixed(2)}" aria-label="Average buy price"></td>
          <td>${price != null ? inr(price, 1) : r.state === "err" ? '<span class="faint">failed</span>' : '<span class="spinner" style="display:inline-block"></span>'}</td>
          <td>${inr(i)}</td><td>${v != null ? inr(v) : "—"}</td><td class="${tone(g)}">${g != null ? (g > 0 ? "+" : "") + inr(g) : "—"}</td>
          <td class="${tone(g)}"><b>${g != null ? signed((g / i) * 100) : "—"}</b></td><td>${v != null && val ? ((v / val) * 100).toFixed(0) + "%" : "—"}</td>
          <td>${r.score ? `<span class="score-cell">${scoreBar(r.score)}<b class="tone-${r.score.tone}">${r.score.passed}/${r.score.total}</b></span>` : "—"}</td>
          <td><button class="chip-x" data-del="${n}" aria-label="Remove ${esc(shortName(h.name))}">×</button></td></tr>`).join("")}</tbody></table></div>
        <div class="btn-row" style="margin:14px 0 0"><button class="btn secondary" id="pf-csv">Download as spreadsheet (CSV)</button></div>`
        : `<div class="empty">No holdings yet. Type a company name above, then the number of shares and the price you paid.</div>`;
      $$("[data-edit]").forEach((inp) => inp.addEventListener("change", () => {
        const l = port(), v = parseFloat(inp.value);
        if (v > 0) { l[+inp.dataset.n][inp.dataset.edit] = v; store.set("sl-port", l); }
        draw();
      }));
      $$("[data-del]").forEach((b) => b.addEventListener("click", () => { const l = port(); l.splice(+b.dataset.del, 1); store.set("sl-port", l); draw(); }));
      const csv = $("#pf-csv");
      if (csv) csv.addEventListener("click", () => download("portfolio.csv", [["Company", "Industry", "Shares", "Avg buy", "Price now", "Put in", "Worth", "Gain", "Gain %", "Health checks passed"],
        ...rows.map(({ h, r, price, inv: i, val: v, gain: g }) => [shortName(h.name), r.industry || "", h.qty, +h.buy.toFixed(2), price, Math.round(i), v != null ? Math.round(v) : "", g != null ? Math.round(g) : "", g != null ? +((g / i) * 100).toFixed(1) : "", r.score ? `${r.score.passed}/${r.score.total}` : ""])]));
      // Allocation by industry
      const by = {};
      ready.forEach((x) => { const k = x.r.industry || "Other"; by[k] = (by[k] || 0) + x.val; });
      const groups = Object.entries(by).sort((a, b) => b[1] - a[1]);
      $("#pf-alloc").innerHTML = groups.length ? groups.map(([k, v]) => `<div class="alloc"><div class="alloc-top"><span>${esc(k)}</span><b class="num">${((v / val) * 100).toFixed(0)}%</b></div><div class="bar"><i style="width:${((v / val) * 100).toFixed(1)}%"></i></div></div>`).join("") : `<p class="muted">Add holdings to see the split.</p>`;
      // Warnings
      const w = [];
      const add = (level, t, d) => w.push(`<div class="risk"><div class="ic ${level}">${ICON[level]}</div><div style="min-width:0"><h4>${esc(t)}</h4><p>${esc(d)}</p></div></div>`);
      if (ready.length) {
        ready.filter((x) => x.val / val > 0.25 && ready.length >= 5).forEach((x) => add("medium", `${shortName(x.h.name)} is ${((x.val / val) * 100).toFixed(0)}% of your portfolio`, "One bad result from a single company would move your whole portfolio. Many investors keep one holding under 15–20%."));
        groups.filter(([, v]) => v / val > 0.4 && groups.length > 1).forEach(([k, v]) => add("medium", `${((v / val) * 100).toFixed(0)}% sits in one industry: ${k}`, "Companies in one industry tend to fall together when that industry has a bad year."));
        if (ready.length < 5) add("low", `Only ${ready.length} holding${ready.length > 1 ? "s" : ""}`, "With very few holdings, each one carries a lot of weight. Spreading across 10–15 unrelated businesses lowers the damage any one can do.");
        ready.filter((x) => x.r.score.failed >= 2 || x.r.score.tone === "high").forEach((x) => add("high", `${shortName(x.h.name)} fails ${x.r.score.failed} health check${x.r.score.failed > 1 ? "s" : ""}`, "Failing on: " + failedList(x.r.score).join(", ") + ". Open the company to see why."));
        ready.filter((x) => x.gain / x.inv <= -0.2).forEach((x) => add("medium", `${shortName(x.h.name)} is down ${Math.abs((x.gain / x.inv) * 100).toFixed(0)}% from your buy price`, "Worth asking again: has the business got worse, or only the price? Your notes on the company page can help."));
        ready.filter((x) => x.r.trend && x.r.trend.tone === "high").forEach((x) => add("low", `${shortName(x.h.name)}: finances weakened last year`, `Trend score ${x.r.trend.passed} of ${x.r.trend.total}.`));
      }
      $("#pf-warn").innerHTML = !list.length ? `<p class="muted">Nothing to check yet.</p>` : w.length ? w.join("") : ready.length < list.length ? `<div class="loading-line"><span class="spinner"></span>Checking your holdings…</div>` : `<div class="empty">No warning signs from these simple rules.</div>`;
    };
    live = draw;
    draw();
  };

  /* ================================================================== Custom screener */
  const FILTERS = [
    ["score", "Health checks passed, at least %", "min", "health check"],
    ["ret", "ROCE (ROE for banks), at least %", "min", "roce"],
    ["s5", "Sales growth 5 yrs, at least %", "min", "cagr"],
    ["p5", "Profit growth 5 yrs, at least %", "min", "cagr"],
    ["qy", "Latest quarter profit growth, at least %", "min", "yoy"],
    ["de", "Debt to equity, at most", "max", "debt to equity"],
    ["pe", "P/E, at most", "max", "stock p/e"],
    ["dy", "Dividend yield, at least %", "min", "dividend yield"],
    ["prom", "Promoter holding, at least %", "min", "promoters"],
    ["trend", "Trend score, at least (of 8)", "min", "trend score"],
    ["mcap", "Market cap, at least ₹ Cr", "min", "market cap"],
    ["mcapmax", "Market cap, at most ₹ Cr", "max", "market cap"],
  ];
  const PRESETS = [
    ["Quality", { score: 75, ret: 20, p5: 12, de: 0.5 }],
    ["Value", { pe: 15, ret: 12, de: 1 }],
    ["Fast growth", { s5: 15, p5: 20 }],
    ["Dividend", { dy: 3, de: 1 }],
    ["Getting stronger", { trend: 7, qy: 0 }],
    ["Small & sound", { mcapmax: 30000, ret: 18, de: 0.3, score: 75 }],
  ];
  const UNIS = [["home", "My 40"], ["nifty50", "Nifty 50"], ["nifty100", "Nifty 100"], ["nifty200", "Nifty 200"], ["nifty500", "Nifty 500"]];
  const metric = (r, k) => (k === "score" ? r.score.share * 100 : k === "trend" ? (r.trend ? r.trend.passed : null) : k === "mcapmax" ? r.score.m.mcap : r.score.m[k]);
  const X = { uni: "home", paths: UNIVERSE, sort: "score", dir: -1 };
  PAGES["/screener"] = (view) => {
    document.title = "Screener · Stock Lens";
    let F = obj("sl-filters");
    view.innerHTML = `<div class="co-head fade-in"><div><h1>Screener</h1><p class="sub" style="margin:8px 0 0">Set your own rules and see which companies meet all of them. A filter only narrows the list — read each company before deciding anything.</p></div></div>
      <div class="grid"><div class="card"><h2>1 · Which companies to search${info("index")}</h2>
          <div class="filters" id="sx-uni">${UNIS.map(([k, l]) => `<button class="chip press" data-uni="${k}">${l}</button>`).join("")}</div>
          <p class="sub" style="margin:0">Bigger lists take longer the first time (the Nifty 500 needs about 5 minutes). After that they open at once for 12 hours.</p></div>
        <div class="card"><h2>2 · Your rules</h2><p class="sub">Leave a box empty to ignore that rule. Or start from a ready-made set:</p>
          <div class="filters">${PRESETS.map(([l], i) => `<button class="chip press" data-preset="${i}">${l}</button>`).join("")}<button class="chip press" data-preset="-1">Clear all</button></div>
          <div class="fgrid">${FILTERS.map(([k, l, , g]) => `<label><span>${l}${info(g)}</span><input type="number" step="any" data-f="${k}" inputmode="decimal"></label>`).join("")}</div>
          <p class="sub" style="margin:12px 0 0">Banks and lenders have no debt figure here, so a debt rule leaves them out.</p></div>
        <div class="card"><div id="sx-res"></div></div></div>`;
    const fill = () => $$("[data-f]").forEach((i) => { i.value = F[i.dataset.f] != null ? F[i.dataset.f] : ""; });
    const markUni = () => $$("[data-uni]").forEach((b) => b.classList.toggle("on", b.dataset.uni === X.uni));
    fill(); markUni();
    $$("[data-f]").forEach((i) => i.addEventListener("input", () => {
      const v = parseFloat(i.value);
      if (isNaN(v)) delete F[i.dataset.f]; else F[i.dataset.f] = v;
      store.set("sl-filters", F); draw();
    }));
    $$("[data-preset]").forEach((b) => b.addEventListener("click", () => { F = +b.dataset.preset < 0 ? {} : { ...PRESETS[+b.dataset.preset][1] }; store.set("sl-filters", F); fill(); draw(); }));
    $$("[data-uni]").forEach((b) => b.addEventListener("click", async () => {
      const k = b.dataset.uni;
      X.uni = k; markUni();
      if (k === "home") X.paths = UNIVERSE;
      else {
        $("#sx-res").innerHTML = `<div class="loading-line"><span class="spinner"></span>Getting the list from the NSE…</div>`;
        try { X.paths = (await api("/api/index", { name: k })).map((x) => x.path); }
        catch (e) { $("#sx-res").innerHTML = `<p class="err">Couldn't get the index list: ${esc(e.message)}</p>`; return; }
      }
      screenAdd(X.paths); draw();
    }));
    const COLS = [["score", "Checks", "health check"], ["ret", "ROCE / ROE %", "roce"], ["s5", "Sales 5y %", "cagr"], ["p5", "Profit 5y %", "cagr"], ["de", "Debt / equity", "debt to equity"], ["pe", "P/E", "stock p/e"], ["dy", "Div yld %", "dividend yield"], ["prom", "Promoter %", "promoters"], ["trend", "Trend", "trend score"], ["mcap", "Mcap ₹ Cr", "market cap"]];
    const draw = () => {
      const box = $("#sx-res");
      if (!box) return;
      const all = X.paths.map((p) => SCR.rows.get(p)).filter(Boolean);
      const done = all.filter((r) => r.state !== "loading").length, bad = all.filter((r) => r.state === "err").length;
      const active = FILTERS.filter(([k]) => F[k] != null);
      let rows = all.filter((r) => r.state === "ok" && active.every(([k, , type]) => { const v = metric(r, k); return v != null && (type === "min" ? v >= F[k] : v <= F[k]); }));
      const val = (r) => (X.sort === "score" ? r.score.share + r.score.passed / 100 - r.score.failed / 1000 : metric(r, X.sort));
      rows.sort((a, b) => { const x = val(a), y = val(b); if (x == null || y == null) return (x == null) - (y == null); return (x - y) * X.dir || (b.score.m.mcap || 0) - (a.score.m.mcap || 0); });
      const n = (v, d) => (v == null ? "—" : inr(v, d));
      box.innerHTML = `<div class="hc-head"><div><h2>3 · ${rows.length} of ${done} companies match</h2>
          <p class="sub">${active.length ? active.length + " rule" + (active.length > 1 ? "s" : "") + " applied" : "No rules set — showing everything"}${bad ? ` · ${bad} could not be read` : ""}. Tap a column to sort, a row to open.</p></div>
          <button class="btn secondary" id="sx-csv" ${rows.length ? "" : "disabled"}>Download CSV</button></div>
        ${done < all.length ? `<div class="loading-line" style="margin-bottom:10px"><span class="spinner"></span>Checked ${done} of ${all.length} — results fill in as they arrive…</div><div class="bar" style="margin-bottom:12px"><i style="width:${((done / all.length) * 100).toFixed(1)}%"></i></div>` : ""}
        <div class="scroll-x"><table class="t screen-t"><thead><tr><th>Company</th>${COLS.map(([k, l, g]) => `<th><button class="th-sort ${X.sort === k ? "on" : ""}" data-xs="${k}">${l}${X.sort === k ? (X.dir < 0 ? " ↓" : " ↑") : ""}</button>${info(g)}</th>`).join("")}</tr></thead>
        <tbody>${rows.slice(0, 150).map((r) => { const s = r.score, m = s.m; return `<tr data-go="${esc(r.go || r.path)}" tabindex="0"><td><div class="co-cell"><b>${esc(r.name)}</b><span class="faint">${esc(r.industry || "")}</span></div></td>
          <td><span class="score-cell">${scoreBar(s)}<b class="tone-${s.tone}">${s.passed}/${s.total}</b></span></td><td>${n(m.ret, 1)}</td><td>${n(m.s5)}</td><td>${n(m.p5)}</td><td>${s.isFin ? '<span class="faint">n/a</span>' : n(m.de, 2)}</td><td>${n(m.pe, 1)}</td><td>${n(m.dy, 2)}</td><td>${n(m.prom, 1)}</td><td>${r.trend ? `<b class="tone-${r.trend.tone}">${r.trend.passed}/${r.trend.total}</b>` : '<span class="faint">n/a</span>'}</td><td>${n(m.mcap)}</td></tr>`; }).join("")
          || `<tr><td colspan="11" class="muted" style="text-align:center;padding:24px">${done < all.length ? "Reading companies…" : "No company meets every rule. Loosen one and try again."}</td></tr>`}</tbody></table></div>
        ${rows.length > 150 ? `<p class="sub" style="margin:12px 0 0">Showing the first 150. The CSV has all ${rows.length}.</p>` : ""}`;
      $$("[data-xs]", box).forEach((b) => b.addEventListener("click", () => { const k = b.dataset.xs; if (X.sort === k) X.dir = -X.dir; else { X.sort = k; X.dir = k === "de" || k === "pe" ? 1 : -1; } draw(); }));
      $$("tr[data-go]", box).forEach((tr) => { tr.addEventListener("click", () => go(tr.dataset.go)); tr.addEventListener("keydown", (e) => { if (e.key === "Enter") go(tr.dataset.go); }); });
      $("#sx-csv").addEventListener("click", () => download("screener-results.csv", [["Company", "Industry", "Checks passed", "Checks counted", "ROCE or ROE %", "Sales growth 5y %", "Profit growth 5y %", "Debt to equity", "P/E", "Dividend yield %", "Promoter %", "Trend score", "Market cap Rs Cr", "Price"],
        ...rows.map((r) => { const m = r.score.m; return [r.name, r.industry, r.score.passed, r.score.total, m.ret, m.s5, m.p5, m.de != null ? +m.de.toFixed(2) : "", m.pe, m.dy, m.prom, r.trend ? r.trend.passed : "", m.mcap, m.price]; })]));
    };
    live = draw;
    screenAdd(X.paths);
    draw();
  };

  /* ================================================================== Financials tab */
  TABS.splice(2, 0, ["fin", "Financials"]);
  const STATEMENTS = [["profit-loss", "Profit & loss"], ["balance-sheet", "Balance sheet"], ["cash-flow", "Cash flow"], ["ratios", "Ratios"], ["quarters", "Quarters"]];
  const gKey = (label) => {
    const l = label.toLowerCase();
    if (l.startsWith("cfo/ebitda")) return "cfo/ebitda";
    return l.replace(/\s*%$/, "").replace(/ in rs$/, "").trim();
  };
  const cleanLabel = (label) => (/^CFO\/EBITDA/i.test(label) ? "CFO/EBITDA %" : label);
  XTABS.fin = (el) => {
    const c = S.company;
    S.fin = S.fin || "profit-loss";
    const t = c.tables[S.fin];
    el.innerHTML = `<div class="card"><div class="hc-head"><div><h2>Financial statements</h2><p class="sub">Every year Screener has on record, in ₹ Crore unless marked %. ${c.consolidated ? "Consolidated" : "Standalone"} figures${info(c.consolidated ? "consolidated" : "standalone")}. Tap an “i” for what a row means.</p></div>
        <button class="btn secondary" id="fin-csv">Download all (CSV)</button></div>
      <div class="seg mini" style="margin-bottom:14px">${STATEMENTS.map(([k, l]) => `<button data-fin="${k}" aria-selected="${k === S.fin}">${l}</button>`).join("")}</div>
      ${t && t.rows.length ? `<div class="scroll-x"><table class="t"><thead><tr><th></th>${t.headers.map((h) => `<th>${esc(h)}</th>`).join("")}<th>Trend</th></tr></thead>
        <tbody>${t.rows.map((r) => `<tr><td>${esc(cleanLabel(r.label))}${info(gKey(r.label))}</td>${r.values.map((v) => `<td class="${v < 0 ? "tone-high" : ""}">${v == null ? "" : inr(v, Math.abs(v) < 100 ? 1 : 0)}</td>`).join("")}<td>${Charts.micro(r.values)}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="muted">Not available for this company.</p>`}</div>`;
    $$("[data-fin]", el).forEach((b) => b.addEventListener("click", () => { S.fin = b.dataset.fin; XTABS.fin(el); }));
    $("#fin-csv", el).addEventListener("click", () => {
      const out = [[c.name, c.consolidated ? "Consolidated" : "Standalone", "Rs Crore"], []];
      STATEMENTS.forEach(([k, l]) => { const tb = c.tables[k]; if (!tb) return; out.push([l, ...tb.headers]); tb.rows.forEach((r) => out.push([cleanLabel(r.label), ...r.values])); out.push([]); });
      download((c.nse_symbol || shortName(c.name)).replace(/[^\w-]+/g, "_") + "-financials.csv", out);
    });
  };

  /* ================================================================== Price tab extras */
  const tone100 = (v) => (v >= 65 ? "good" : v >= 40 ? "medium" : "high");
  function threeWay() {
    const c = S.company, sc = S.score, m = sc.m, tr = Score.trend(c);
    const part = (label, pts, max, note) => ({ label, pts, max, note });
    const total = (parts) => { const live = parts.filter((p) => p.pts != null); const mx = live.reduce((a, p) => a + p.max, 0); return mx ? Math.round((live.reduce((a, p) => a + p.pts, 0) / mx) * 100) : null; };
    // Quality
    const g = [m.s5, m.p5].filter((x) => x != null);
    const Q = [
      part(sc.isFin ? "Return on equity" : "Return on capital", m.ret != null ? clamp(m.ret / 25) * 30 : null, 30, m.ret != null ? m.ret.toFixed(1) + "%" : ""),
      part("Growth, 5 yrs", g.length ? clamp(g.reduce((a, b) => a + b, 0) / g.length / 20) * 25 : null, 25, g.length ? (g.reduce((a, b) => a + b, 0) / g.length).toFixed(0) + "% a year" : ""),
      part("Low debt", sc.isFin || m.de == null ? null : clamp(1 - (m.de - 0.1) / 1.4) * 15, 15, m.de != null ? "D/E " + m.de.toFixed(2) : ""),
      part("Profit turned into cash", sc.isFin || m.cash == null ? null : clamp((m.cash - 40) / 60) * 15, 15, m.cash != null ? m.cash.toFixed(0) + "%" : ""),
      part("Getting stronger", tr ? (tr.passed / tr.total) * 15 : null, 15, tr ? `${tr.passed}/${tr.total}` : ""),
    ];
    // Valuation (higher = cheaper)
    const pe = (S.val && S.val.pe) || [], peNow = m.pe;
    const below = pe.length >= 10 ? pe.filter((x) => x[1] < pe[pe.length - 1][1]).length / pe.length : null;
    const peg = peNow > 0 && m.p5 > 0 ? peNow / m.p5 : null;
    const peers = (c.peers || []).filter((p) => p.path !== c.path && p["P/E"] > 0).map((p) => p["P/E"]).sort((a, b) => a - b);
    const med = peers.length >= 3 ? peers[Math.floor(peers.length / 2)] : null;
    const V = peNow > 0 ? [
      part("Against its own 5 years", below != null ? (1 - below) * 40 : null, 40, below != null ? `cheaper ${Math.round(below * 100)}% of the time` : ""),
      part("Against profit growth (PEG)", peg != null ? clamp((3 - peg) / 2) * 30 : null, 30, peg != null ? "PEG " + peg.toFixed(1) : ""),
      part("Against similar companies", med ? clamp((1.5 - peNow / med) / 0.8) * 30 : null, 30, med ? `P/E ${peNow.toFixed(0)} vs ${med.toFixed(0)}` : ""),
    ] : [];
    // Momentum
    const pts = S.price && S.price.points, nf = S.nifty && S.nifty.points;
    let M = [];
    if (pts) {
      const v = pts.map((x) => x[1]), last = v[v.length - 1], a200 = Tech.sma(v, 200).pop();
      const d200 = a200 ? (last / a200 - 1) * 100 : null, r1 = Tech.ret(pts, 365), n1 = nf ? Tech.ret(nf, 365) : null, r6 = Tech.ret(pts, 182), rsi = Tech.rsi(v);
      const rel = r1 != null && n1 != null ? r1 - n1 : null;
      M = [
        part("Against 200-day average", d200 != null ? clamp((d200 + 10) / 30) * 30 : null, 30, d200 != null ? signed(d200) : ""),
        part("1 year against the Nifty 50", rel != null ? clamp((rel + 20) / 50) * 30 : null, 30, rel != null ? (rel > 0 ? "+" : "") + rel.toFixed(0) + " pts" : ""),
        part("Last 6 months", r6 != null ? clamp((r6 + 10) / 35) * 20 : null, 20, r6 != null ? signed(r6, 0) : ""),
        part("Speed (RSI)", rsi != null ? (rsi >= 50 && rsi <= 70 ? 20 : (rsi >= 40 && rsi < 50) || (rsi > 70 && rsi <= 80) ? 12 : 5) : null, 20, rsi != null ? rsi.toFixed(0) : ""),
      ];
    }
    const card = (key, title, sub, parts) => {
      const t = total(parts);
      return `<div class="card three"><div class="hc-head"><div><h2>${title}${info(key)}</h2><p class="sub">${sub}</p></div>
        <div class="hc-total tone-${t == null ? "info" : tone100(t)}"><b>${t == null ? "—" : t}<span>/100</span></b></div></div>
        ${t == null ? `<p class="muted" style="font-size:.875rem">${key === "valuation score" ? "No P/E to work with (the company is loss-making or data is still loading)." : "Still loading…"}</p>`
        : `<div class="bar big"><i class="bg-${tone100(t)}" style="width:${t}%"></i></div><ul class="list three-list">${parts.filter((p) => p.pts != null).map((p) => `<li><span>${esc(p.label)}</span><span class="faint num">${esc(p.note)}</span><b class="num">${Math.round(p.pts)}/${p.max}</b></li>`).join("")}</ul>`}</div>`;
    };
    return `<div class="grid g3 three-wrap">${card("quality score", "Quality", "How good is the business?", Q)}${card("valuation score", "Valuation", "How cheap is the share? Higher = cheaper.", V)}${card("momentum score", "Momentum", "How strong is the price lately?", M)}</div>`;
  }

  function fairValue(box) {
    const c = S.company, m = S.score.m, epsS = (S.val && S.val.eps) || [];
    const price = S.price ? S.price.points[S.price.points.length - 1][1] : m.price;
    const eps = epsS.length ? epsS[epsS.length - 1][1] : m.pe > 0 && price ? price / m.pe : null;
    if (!(eps > 0) || !price) { box.innerHTML = `<h2>Fair-value calculator${info("fair value")}</h2><p class="muted">${S.val ? "Needs a positive profit per share, so it cannot be worked out for a loss-making company." : "Loading…"}</p>`; return; }
    S.fv = S.fv && S.fv.path === c.path ? S.fv : { path: c.path, g: Math.round(clamp(m.p5 != null ? Math.min(m.p5, 20) : 10, 3, 20)), pe: Math.round(clamp((S.val && S.val.median_pe) || m.pe || 20, 8, 35)), r: 12 };
    const fv = S.fv;
    const slider = (k, label, key, min, max, unit) => `<label class="slider"><span>${label}${info(key)}</span><b class="num" id="fv-${k}-v">${fv[k]}${unit}</b><input type="range" min="${min}" max="${max}" step="1" value="${fv[k]}" data-fv="${k}" data-unit="${unit}"></label>`;
    box.innerHTML = `<h2>Fair-value calculator${info("fair value")}</h2><p class="sub">Your own guesses in, a rough worth out. Starting values come from the company's past; move them to see how much the answer swings.</p>
      ${slider("g", "Profit growth a year, next 10 years", "cagr", 0, 35, "%")}${slider("pe", "P/E after 10 years", "exit pe", 5, 60, "")}${slider("r", "Return you want a year", "required return", 8, 20, "%")}
      <div id="fv-out"></div>
      <p class="sub" style="margin:10px 0 0">Based on profit per share${info("eps")} of ₹${inr(eps, 1)} today. Dividends are left out. A calculator, not a price target.</p>`;
    const out = () => {
      const fair = (eps * (1 + fv.g / 100) ** 10 * fv.pe) / (1 + fv.r / 100) ** 10, diff = (fair / price - 1) * 100;
      const need = ((price * (1 + fv.r / 100) ** 10) / (eps * fv.pe)) ** 0.1 - 1;
      $("#fv-out").innerHTML = `<div class="fv-row"><div><div class="k">Worth with these guesses</div><div class="v">₹${inr(fair)}</div></div><div><div class="k">Price today</div><div class="v">₹${inr(price)}</div></div>
        <div><div class="k">Gap</div><div class="v ${tone(diff)}">${signed(diff, 0)}</div></div></div>
        <p style="margin:10px 0 0;font-size:.9375rem">${diff >= 0 ? "With these guesses the share is worth more than it costs today." : "With these guesses the share costs more than it is worth today."}
        For today's price to give you ${fv.r}% a year, profit must grow about <b>${(need * 100).toFixed(0)}%</b> a year for 10 years${m.p5 != null ? ` (it grew ${m.p5}% a year over the past 5)` : ""}.</p>`;
    };
    $$("[data-fv]", box).forEach((i) => i.addEventListener("input", () => { fv[i.dataset.fv] = +i.value; $(`#fv-${i.dataset.fv}-v`).textContent = i.value + i.dataset.unit; out(); }));
    out();
  }

  const DIV = {};
  function dividends(box) {
    const c = S.company, sym = c.nse_symbol ? c.nse_symbol + ".NS" : c.bse_code ? c.bse_code + ".BO" : null;
    const head = `<h2>Dividends and share splits${info("dividend")}</h2>`;
    if (!sym) { box.innerHTML = head + `<p class="muted">No exchange symbol to look up.</p>`; return; }
    const d = DIV[c.path];
    if (!d) {
      box.innerHTML = head + `<div class="loading-line"><span class="spinner"></span>Loading 10 years of payouts…</div>`;
      DIV[c.path] = { loading: true };
      api("/api/dividends", { symbol: sym }).then((r) => { DIV[c.path] = r; }).catch(() => { DIV[c.path] = { dividends: [], splits: [], failed: true }; })
        .then(() => { const b = $("#pro-div"); if (b && S.company === c) dividends(b); });
      return;
    }
    if (d.loading) return;
    const by = {};
    d.dividends.forEach(([ts, amt]) => { const y = new Date(ts * 1000).getFullYear(); by[y] = (by[y] || 0) + amt; });
    const years = Object.keys(by).sort();
    const price = S.price ? S.price.points[S.price.points.length - 1][1] : null;
    const cut = Date.now() / 1000 - 365 * 86400, last12 = d.dividends.filter((x) => x[0] >= cut).reduce((a, x) => a + x[1], 0);
    box.innerHTML = head + (years.length ? `<p class="sub">₹ per share paid in each calendar year (adjusted for splits), from Yahoo Finance.</p><div id="ch-div"></div>
        <p style="margin:12px 0 0;font-size:.9375rem">Paid in the last 12 months: <b>₹${inr(last12, 2)}</b> a share${price && last12 ? ` — ${((last12 / price) * 100).toFixed(1)}% of today's price` : ""}. ${d.dividends.length} payouts in 10 years.</p>`
      : `<p class="muted">${d.failed ? "Couldn't load dividend history." : "No dividends on record in the last 10 years."}</p>`)
      + (d.splits.length ? `<p class="sub" style="margin:10px 0 0">Share splits or bonuses${info("stock split")}: ${d.splits.map(([ts, r]) => `<b>${esc(r)}</b> on ${dateStr(ts * 1000)}`).join(" · ")}</p>` : "");
    const ch = $("#ch-div");
    if (ch) ch.appendChild(Charts.bars(years, years.map((y) => +by[y].toFixed(2)), { color: "var(--s3)", name: "Dividend per share", tipFmt: (v) => "₹" + inr(v, 2), width: ch.clientWidth, height: 170 }));
  }

  HOOKS.price = () => {
    $("#pro-top").innerHTML = threeWay();
    $("#pro-bottom").innerHTML = `<div class="card" id="pro-fv"></div><div class="card" id="pro-div"></div>`;
    fairValue($("#pro-fv"));
    dividends($("#pro-div"));
  };

  /* ================================================================== What changed on the watchlist */
  HOOKS.home = () => {
    const draw = () => {
      const box = $("#changes");
      if (!box) return;
      const watch = store.get("sl-watch"), snap = obj("sl-snap");
      if (!watch.length) { box.innerHTML = ""; return; }
      const items = [];
      let fresh = false, oldest = Date.now(), ready = 0;
      const now = (r) => ({ at: Date.now(), price: r.score.m.price, passed: r.score.passed, total: r.score.total, ann: r.ann ? r.ann.date : null, quarter: r.quarter });
      watch.forEach((w) => {
        const r = SCR.rows.get(w.path);
        if (!r || r.state !== "ok") return;
        ready++;
        const s = snap[w.path];
        if (!s) { snap[w.path] = now(r); fresh = true; return; }
        oldest = Math.min(oldest, s.at);
        const ch = [];
        if (s.price && r.score.m.price) { const p = (r.score.m.price / s.price - 1) * 100; if (Math.abs(p) >= 3) ch.push(`<span class="${tone(p)}">Price ${p > 0 ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}%</span> <span class="faint">(₹${inr(s.price)} → ₹${inr(r.score.m.price)})</span>`); }
        if (r.quarter && s.quarter && r.quarter !== s.quarter) ch.push(`New quarterly results: <b>${esc(r.quarter)}</b>`);
        if (s.passed != null && (r.score.passed !== s.passed || r.score.total !== s.total)) ch.push(`Health checks ${s.passed}/${s.total} → <b>${r.score.passed}/${r.score.total}</b>`);
        if (r.ann && r.ann.date && r.ann.date !== s.ann) ch.push(`New exchange filing: ${esc(r.ann.title)}`);
        if (ch.length) items.push(`<li><a href="#/c${esc(r.go || w.path)}"><b>${esc(shortName(r.name))}</b></a><div class="chg">${ch.map((x) => `<div>${x}</div>`).join("")}</div></li>`);
      });
      if (fresh) store.set("sl-snap", snap);
      box.innerHTML = `<section class="card fade-in" style="margin-bottom:16px"><div class="hc-head"><div><h2>Since you last checked your watchlist</h2>
          <p class="sub">${ready < watch.length ? "Checking…" : items.length ? `Changes since ${dateStr(oldest)}.` : `Nothing notable has changed since ${dateStr(oldest)}.`} Watches price moves of 3% or more, new results, new filings and health-check changes.</p></div>
          ${items.length ? `<button class="btn secondary" id="chg-seen">Mark all as seen</button>` : ""}</div>
        ${items.length ? `<ul class="list">${items.join("")}</ul>` : ""}</section>`;
      const b = $("#chg-seen");
      if (b) b.addEventListener("click", () => {
        const s2 = obj("sl-snap");
        watch.forEach((w) => { const r = SCR.rows.get(w.path); if (r && r.state === "ok") s2[w.path] = now(r); });
        store.set("sl-snap", s2); draw();
      });
    };
    live = draw;
    draw();
  };

  SL.start();
})();
