/* Stock Lens — trading-style chart (candles, volume, averages, RSI, Nifty compare).
   Drawn with TradingView's open-source Lightweight Charts library. */
(function () {
  "use strict";
  const IST = 19800; // seconds ahead of UTC
  const RANGES = [["1D", 0], ["5D", 0], ["1M", 31], ["6M", 183], ["1Y", 366], ["3Y", 1096], ["5Y", 1827], ["Max", 0]];
  const st = { range: "1Y", agg: "D", type: "candle", ma50: true, ma200: true, vol: true, rsi: false, nifty: false, marks: true };
  try { Object.assign(st, JSON.parse(localStorage.getItem("sl-chart")) || {}); } catch (e) {}
  const save = () => { try { localStorage.setItem("sl-chart", JSON.stringify(st)); } catch (e) {} };
  const data = {}; // "SYMBOL|view" -> rows
  let cur = null;  // charts currently on the page, removed before a redraw

  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const day = (ts) => new Date((ts + IST) * 1000).toISOString().slice(0, 10);
  const fmt = (v, d = 2) => (v == null ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: v < 100 ? Math.min(d, 2) : 0 }));
  const vol = (v) => (v >= 1e7 ? (v / 1e7).toFixed(2) + " Cr" : v >= 1e5 ? (v / 1e5).toFixed(2) + " L" : v >= 1e3 ? (v / 1e3).toFixed(1) + "k" : String(v));

  function sma(v, n) { const out = []; let s = 0; for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; out.push(i >= n - 1 ? s / n : null); } return out; }
  function rsi(v, n = 14) {
    const out = new Array(v.length).fill(null);
    if (v.length <= n) return out;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const d = v[i] - v[i - 1]; if (d > 0) g += d; else l -= d; }
    g /= n; l /= n;
    out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (let i = n + 1; i < v.length; i++) {
      const d = v[i] - v[i - 1];
      g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
  }
  // Daily rows -> weekly or monthly candles. Extra per-day arrays (averages) keep the bucket's last value.
  function aggregate(rows, mode, extras) {
    if (mode === "D") return { bars: rows.map((r) => ({ time: day(r[0]), o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] })), extras };
    const bars = [], ex = extras.map(() => []);
    let key = null;
    rows.forEach((r, i) => {
      const d = new Date((r[0] + IST) * 1000);
      let k;
      if (mode === "M") k = d.toISOString().slice(0, 7);
      else { const m = new Date(d); m.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); k = m.toISOString().slice(0, 10); }
      if (k !== key) { key = k; bars.push({ time: day(r[0]), o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }); ex.forEach((e) => e.push(null)); }
      else { const b = bars[bars.length - 1]; b.h = Math.max(b.h, r[2]); b.l = Math.min(b.l, r[3]); b.c = r[4]; b.v += r[5]; }
      extras.forEach((e, j) => { ex[j][ex[j].length - 1] = e[i]; });
    });
    return { bars, extras: ex };
  }

  async function get(symbol, view) {
    const k = symbol + "|" + view;
    if (!data[k]) data[k] = (await SL.api("/api/ohlc", { symbol, view })).rows;
    return data[k];
  }

  function mount(box, symbol, name) {
    const { esc, info } = SL;
    const intraday = () => st.range === "1D" || st.range === "5D";
    const tog = (k, label, key) => `<button class="toggle ct" data-ct="${k}" aria-pressed="${!!st[k]}">${label}</button>${key ? info(key) : ""}`;
    box.innerHTML = `<div class="hc-head"><div><h2>Chart${info("candlestick")}</h2><p class="sub">Scroll or pinch to zoom, drag to move through time. Prices are delayed by about 15 minutes.</p></div>
        <div class="seg mini" id="ct-range">${RANGES.map(([k]) => `<button data-r="${k}" aria-selected="${k === st.range}">${k}</button>`).join("")}</div></div>
      <div class="ct-tools">
        <div class="seg mini" id="ct-type"><button data-t="candle" aria-selected="${st.type === "candle"}">Candles</button><button data-t="line" aria-selected="${st.type === "line"}">Line</button></div>
        <div class="seg mini" id="ct-agg">${[["D", "Day"], ["W", "Week"], ["M", "Month"]].map(([k, l]) => `<button data-a="${k}" aria-selected="${k === st.agg}">${l}</button>`).join("")}</div>
        <span class="ct-group">${tog("ma50", "50-day avg")}${tog("ma200", "200-day avg", "moving average")}${tog("vol", "Volume", "volume")}${tog("rsi", "RSI", "rsi")}${tog("nifty", "Nifty 50", "nifty")}${tog("marks", "Dividends", "dividend")}</span>
      </div>
      <div class="ct-wrap"><div class="ct-legend" id="ct-legend"></div><div id="ct-main"></div><div class="ct-msg" id="ct-msg"></div></div>
      <div id="ct-rsi-wrap" class="hidden"><div class="ct-sub">RSI (14) — above 70 has risen fast, below 30 has fallen fast</div><div id="ct-rsi"></div></div>
      <p class="sub" style="margin:10px 0 0">Candle: green closed higher than it opened, red closed lower. The thin line shows the day's high and low. Chart drawn with <a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView</a> Lightweight Charts.</p>`;
    const $ = (s) => box.querySelector(s);
    const msg = (t) => { $("#ct-msg").textContent = t || ""; $("#ct-msg").classList.toggle("hidden", !t); };

    async function draw() {
      if (!box.isConnected) return;
      if (cur) { cur.forEach((c) => { try { c.remove(); } catch (e) {} }); cur = null; }
      $("#ct-main").innerHTML = ""; $("#ct-rsi").innerHTML = ""; $("#ct-legend").innerHTML = "";
      box.querySelectorAll("#ct-agg button, [data-ct=ma50], [data-ct=ma200], [data-ct=nifty], [data-ct=marks]").forEach((b) => { b.disabled = intraday(); });
      msg("Loading candles…");
      let rows, nifty = null, divs = null;
      try {
        rows = await get(symbol, st.range === "1D" ? "1d" : st.range === "5D" ? "5d" : "daily");
        if (!intraday() && st.nifty) nifty = await get("^NSEI", "daily").catch(() => null);
        if (!intraday() && st.marks) divs = await SL.api("/api/dividends", { symbol }).catch(() => null);
      } catch (e) { msg("Couldn't load chart data: " + e.message); return; }
      if (!box.isConnected) return;
      if (!rows.length) { msg(intraday() ? "No trades yet for this period (the market may be closed)." : "No price history found."); return; }
      msg("");
      const L = LightweightCharts, up = css("--good"), down = css("--high"), text = css("--text-2"), grid = css("--sep");
      const base = {
        autoSize: true, layout: { background: { color: "transparent" }, textColor: text, fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 11 },
        grid: { vertLines: { color: grid }, horzLines: { color: grid } }, rightPriceScale: { borderVisible: false }, leftPriceScale: { borderVisible: false, visible: false },
        timeScale: { borderVisible: false, timeVisible: intraday(), secondsVisible: false, rightOffset: 3 },
        crosshair: { mode: L.CrosshairMode.Normal }, localization: { priceFormatter: (p) => fmt(p) },
      };
      const chart = L.createChart($("#ct-main"), base);
      cur = [chart];

      // Bars and overlays
      let bars, m50 = [], m200 = [], rs;
      if (intraday()) {
        bars = rows.map((r) => ({ time: r[0] + IST, o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));
      } else {
        const closes = rows.map((r) => r[4]);
        const a = aggregate(rows, st.agg, [sma(closes, 50), sma(closes, 200)]);
        bars = a.bars; m50 = a.extras[0]; m200 = a.extras[1];
      }
      rs = rsi(bars.map((b) => b.c));
      chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.08, bottom: st.vol ? 0.24 : 0.06 } });
      let main;
      if (st.type === "candle") {
        main = chart.addCandlestickSeries({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down, priceLineVisible: false });
        main.setData(bars.map((b) => ({ time: b.time, open: b.o, high: b.h, low: b.l, close: b.c })));
      } else {
        main = chart.addAreaSeries({ lineColor: css("--s1"), topColor: css("--s1") + "40", bottomColor: css("--s1") + "00", lineWidth: 2, priceLineVisible: false });
        main.setData(bars.map((b) => ({ time: b.time, value: b.c })));
      }
      const line = (vals, color, title) => {
        const s = chart.addLineSeries({ color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title });
        s.setData(bars.map((b, i) => (vals[i] == null ? { time: b.time } : { time: b.time, value: +vals[i].toFixed(2) })));
        return s;
      };
      const s50 = !intraday() && st.ma50 ? line(m50, css("--s4"), "") : null;
      const s200 = !intraday() && st.ma200 ? line(m200, css("--s2"), "") : null;
      if (st.vol) {
        const v = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", priceLineVisible: false, lastValueVisible: false });
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
        v.setData(bars.map((b) => ({ time: b.time, value: b.v, color: (b.c >= b.o ? up : down) + "66" })));
      }
      let nSeries = null;
      if (nifty && nifty.length) {
        const na = aggregate(nifty, st.agg, []).bars, first = bars[0].time;
        chart.applyOptions({ leftPriceScale: { visible: true, borderVisible: false } });
        nSeries = chart.addLineSeries({ color: css("--text-3"), lineWidth: 1.5, priceScaleId: "left", priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        nSeries.setData(na.filter((b) => b.time >= first).map((b) => ({ time: b.time, value: b.c })));
      }
      if (divs && (divs.dividends.length || divs.splits.length)) {
        const at = (ts) => { const d = day(ts); let hit = null; for (const b of bars) { if (b.time <= d) hit = b.time; else break; } return hit; };
        const marks = [
          ...divs.dividends.map(([ts, amt]) => ({ time: at(ts), position: "belowBar", color: css("--s3"), shape: "circle", text: "D ₹" + fmt(amt) })),
          ...divs.splits.map(([ts, r]) => ({ time: at(ts), position: "aboveBar", color: css("--s5"), shape: "arrowDown", text: "Split " + r })),
        ].filter((x) => x.time).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
        main.setMarkers(marks);
      }

      // Visible window
      const days = (RANGES.find(([k]) => k === st.range) || [])[1];
      if (days) {
        const lastTs = rows[rows.length - 1][0];
        chart.timeScale().setVisibleRange({ from: day(lastTs - days * 86400), to: bars[bars.length - 1].time });
      } else chart.timeScale().fitContent();

      // RSI panel, kept in step with the main chart
      $("#ct-rsi-wrap").classList.toggle("hidden", !st.rsi);
      if (st.rsi) {
        // The RSI panel only follows the main chart; zooming and dragging happen on the main chart.
        const rc = L.createChart($("#ct-rsi"), { ...base, timeScale: { ...base.timeScale, visible: false }, handleScroll: false, handleScale: false });
        cur.push(rc);
        const r = rc.addLineSeries({ color: css("--s1"), lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true, priceFormat: { type: "custom", formatter: (p) => p.toFixed(0) } });
        r.setData(bars.map((b, i) => (rs[i] == null ? { time: b.time } : { time: b.time, value: +rs[i].toFixed(1) })));
        [70, 30].forEach((p) => r.createPriceLine({ price: p, color: text, lineWidth: 1, lineStyle: L.LineStyle.Dashed, axisLabelVisible: true }));
        chart.timeScale().subscribeVisibleLogicalRangeChange((rg) => { if (rg) rc.timeScale().setVisibleLogicalRange(rg); });
        const rg = chart.timeScale().getVisibleLogicalRange();
        if (rg) rc.timeScale().setVisibleLogicalRange(rg);
      }

      // Legend follows the crosshair; shows the latest candle when the pointer is away.
      const byTime = new Map(bars.map((b, i) => [String(b.time), i]));
      const legend = (i) => {
        const b = bars[i], prev = bars[i - 1], ch = prev ? ((b.c / prev.c) - 1) * 100 : null;
        const when = intraday() ? new Date(b.time * 1000).toLocaleString("en-IN", { timeZone: "UTC", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
          : new Date(b.time + "T00:00:00Z").toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
        const c = b.c >= b.o ? "tone-good" : "tone-high";
        $("#ct-legend").innerHTML = `<b>${esc(name)}</b> <span class="faint">${when}</span><br>
          <span>O <b class="${c}">${fmt(b.o)}</b></span> <span>H <b class="${c}">${fmt(b.h)}</b></span> <span>L <b class="${c}">${fmt(b.l)}</b></span> <span>C <b class="${c}">${fmt(b.c)}</b></span>
          ${ch != null ? `<span class="${ch >= 0 ? "tone-good" : "tone-high"}">${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%</span>` : ""} <span class="faint">Vol ${vol(b.v)}</span>
          ${s50 && m50[i] != null ? `<span style="color:${css("--s4")}">50d ${fmt(m50[i])}</span>` : ""} ${s200 && m200[i] != null ? `<span style="color:${css("--s2")}">200d ${fmt(m200[i])}</span>` : ""}
          ${st.rsi && rs[i] != null ? `<span class="faint">RSI ${rs[i].toFixed(0)}</span>` : ""}${nSeries ? ` <span class="faint">Nifty 50 on the left scale</span>` : ""}`;
      };
      legend(bars.length - 1);
      chart.subscribeCrosshairMove((p) => { const i = p && p.time != null ? byTime.get(String(p.time)) : null; legend(i != null ? i : bars.length - 1); });
    }

    const sel = (wrap, attr, val) => box.querySelectorAll(`${wrap} button`).forEach((b) => b.setAttribute("aria-selected", b.dataset[attr] === val));
    box.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => {
      st.range = b.dataset.r;
      // Long ranges read better with bigger candles
      if (st.range === "Max") st.agg = "M"; else if (st.range === "3Y" || st.range === "5Y") st.agg = "W"; else if (!intraday()) st.agg = "D";
      sel("#ct-range", "r", st.range); sel("#ct-agg", "a", st.agg); save(); draw();
    }));
    box.querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", () => { st.type = b.dataset.t; sel("#ct-type", "t", st.type); save(); draw(); }));
    box.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => { st.agg = b.dataset.a; sel("#ct-agg", "a", st.agg); save(); draw(); }));
    box.querySelectorAll("[data-ct]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.ct; st[k] = !st[k]; b.setAttribute("aria-pressed", st[k]); save(); draw(); }));
    box._redraw = draw;
    draw();
  }

  // Colours come from the page theme, so redraw when it is switched.
  document.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest("#theme")) return;
    setTimeout(() => { const b = document.querySelector("#pchart"); if (b && b._redraw) b._redraw(); }, 30);
  });

  window.ProChart = { mount };
})();
