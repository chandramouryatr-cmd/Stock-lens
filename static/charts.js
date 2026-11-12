/* Small, dependency-free SVG charts with hover tooltips. */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function niceTicks(lo, hi, n = 4) {
    if (!isFinite(lo) || !isFinite(hi)) return [0, 1];
    if (lo === hi) { hi = lo + 1; lo = Math.min(0, lo); }
    const step0 = (hi - lo) / n;
    const mag = 10 ** Math.floor(Math.log10(step0));
    const f = step0 / mag;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
    const start = Math.floor(lo / step) * step;
    const out = [];
    for (let v = start; v < hi + step * 0.999; v += step) out.push(+v.toFixed(10));
    if (out.length < 2) out.push(start + step);
    return out;
  }

  function shortNum(v) {
    const a = Math.abs(v);
    if (a >= 1e5) return (v / 1e5).toFixed(a >= 1e6 ? 0 : 1).replace(/\.0$/, "") + "L";
    if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "k";
    return String(Math.round(v * 100) / 100);
  }

  function frame(W, H) {
    const wrap = document.createElement("div");
    wrap.className = "chart";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("role", "img");
    wrap.appendChild(svg);
    const tip = document.createElement("div");
    tip.className = "tip";
    wrap.appendChild(tip);
    return { wrap, svg, tip };
  }

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Hover: map pointer x to the nearest index, then let the chart decorate it.
  function hover(wrap, svg, tip, W, n, xOf, html, onIndex) {
    let cur = -1;
    const move = (e) => {
      const r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) * W) / r.width;
      let best = 0, bd = Infinity;
      for (let i = 0; i < n; i++) { const d = Math.abs(xOf(i) - x); if (d < bd) { bd = d; best = i; } }
      if (best !== cur) { cur = best; onIndex(best); tip.innerHTML = html(best); }
      tip.classList.add("on");
      const wr = wrap.getBoundingClientRect();
      const px = (xOf(best) / W) * r.width + (r.left - wr.left);
      const tw = tip.offsetWidth;
      let left = px + 12;
      if (left + tw > wr.width) left = px - tw - 12;
      tip.style.left = Math.max(0, left) + "px";
      tip.style.top = Math.max(0, e.clientY - wr.top - tip.offsetHeight - 10) + "px";
    };
    const leave = () => { cur = -1; tip.classList.remove("on"); onIndex(-1); };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerdown", move);
    svg.addEventListener("pointerleave", leave);
  }

  function axes(svg, ticks, y, W, m, fmt) {
    for (const t of ticks) {
      el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: "gridline", "stroke-dasharray": t === 0 ? "" : "2 3" }, svg);
      const tx = el("text", { x: m.l - 6, y: y(t) + 3.5, "text-anchor": "end", class: "axis" }, svg);
      tx.textContent = fmt(t);
    }
  }

  function xLabels(svg, labels, xOf, H, m) {
    const step = Math.ceil(labels.length / 7);
    labels.forEach((l, i) => {
      if ((labels.length - 1 - i) % step) return; // always keep the latest label
      const t = el("text", { x: xOf(i), y: H - m.b + 16, "text-anchor": "middle", class: "axis" }, svg);
      t.textContent = l;
    });
  }

  /** Single-series bar chart. Rounded 4px data-end, anchored to the zero baseline. */
  function bars(labels, values, { color = "var(--s1)", fmt = shortNum, tipFmt = fmt, height = 190, name = "", width = 560 } = {}) {
    const W = Math.max(280, width), H = height, m = { l: 46, r: 6, t: 10, b: 24 };
    const { wrap, svg, tip } = frame(W, H);
    const vals = values.map((v) => (v == null ? null : v));
    const nums = vals.filter((v) => v != null);
    const ticks = niceTicks(Math.min(0, ...nums), Math.max(0, ...nums), 4);
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - y0) / (y1 - y0));
    const bw = (W - m.l - m.r) / vals.length;
    const barW = Math.max(4, Math.min(30, bw - 2));
    const xOf = (i) => m.l + bw * i + bw / 2;
    axes(svg, ticks, y, W, m, fmt);
    const rects = vals.map((v, i) => {
      if (v == null) return null;
      const x = xOf(i) - barW / 2, top = y(Math.max(v, 0)), bot = y(Math.min(v, 0));
      const h = Math.max(1, bot - top), r = Math.min(4, h, barW / 2);
      const d = v >= 0
        ? `M${x},${bot}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${bot}Z`
        : `M${x},${top}V${bot - r}Q${x},${bot} ${x + r},${bot}H${x + barW - r}Q${x + barW},${bot} ${x + barW},${bot - r}V${top}Z`;
      return el("path", { d, style: `fill:${v < 0 ? "var(--high)" : color};transition:opacity 120ms` }, svg);
    });
    xLabels(svg, labels, xOf, H, m);
    svg.setAttribute("aria-label", `${name} bar chart, ${labels[0]} to ${labels[labels.length - 1]}`);
    hover(wrap, svg, tip, W, vals.length, xOf,
      (i) => `<div class="faint">${esc(labels[i])}</div><b>${esc(vals[i] == null ? "—" : tipFmt(vals[i]))}</b>`,
      (i) => rects.forEach((r, j) => r && (r.style.opacity = i < 0 || i === j ? 1 : 0.35)));
    return wrap;
  }

  /** Multi-series line chart with crosshair. series: [{name, color, values}] */
  function lines(labels, series, { fmt = (v) => v + "%", height = 230, yMin = null, width = 560 } = {}) {
    const W = Math.max(280, width), H = height, m = { l: 40, r: 10, t: 10, b: 24 };
    const { wrap, svg, tip } = frame(W, H);
    const all = series.flatMap((s) => s.values).filter((v) => v != null);
    const ticks = niceTicks(yMin ?? Math.min(...all), Math.max(...all), 4);
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - y0) / (y1 - y0));
    const n = labels.length;
    const xOf = (i) => (n === 1 ? (m.l + W - m.r) / 2 : m.l + ((W - m.l - m.r) * i) / (n - 1));
    axes(svg, ticks, y, W, m, fmt);
    const cross = el("line", { y1: m.t, y2: H - m.b, class: "gridline", style: "opacity:0" }, svg);
    series.forEach((s) => {
      let d = "", pen = false;
      s.values.forEach((v, i) => {
        if (v == null) { pen = false; return; }
        d += `${pen ? "L" : "M"}${xOf(i).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      });
      el("path", { d, fill: "none", style: `stroke:${s.color}`, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    });
    const dots = series.map((s) => el("circle", { r: 4, style: `fill:${s.color};stroke:var(--surface);stroke-width:2;opacity:0` }, svg));
    xLabels(svg, labels, xOf, H, m);
    svg.setAttribute("aria-label", `Line chart of ${series.map((s) => s.name).join(", ")}`);
    hover(wrap, svg, tip, W, n, xOf,
      (i) => `<div class="faint">${esc(labels[i])}</div>` + series
        .map((s) => ({ s, v: s.values[i] }))
        .sort((a, b) => (b.v ?? -1e9) - (a.v ?? -1e9))
        .map(({ s, v }) => `<div class="row"><span><span class="dot" style="background:${s.color};width:8px;height:8px"></span> ${esc(s.name)}</span><b>${v == null ? "—" : esc(fmt(v))}</b></div>`)
        .join(""),
      (i) => {
        cross.style.opacity = i < 0 ? 0 : 1;
        if (i >= 0) { cross.setAttribute("x1", xOf(i)); cross.setAttribute("x2", xOf(i)); }
        dots.forEach((d, k) => {
          const v = series[k].values[i];
          d.style.opacity = i < 0 || v == null ? 0 : 1;
          if (i >= 0 && v != null) { d.setAttribute("cx", xOf(i)); d.setAttribute("cy", y(v)); }
        });
      });
    const legend = document.createElement("div");
    legend.className = "legend";
    legend.innerHTML = series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("");
    const box = document.createElement("div");
    box.append(legend, wrap);
    return box;
  }

  /** Price sparkline with crosshair. points: [[unixSec, close]] */
  function spark(points, { width = 240, height = 54, color } = {}) {
    const W = width, H = height, m = { l: 2, r: 2, t: 4, b: 4 };
    const { wrap, svg, tip } = frame(W, H);
    wrap.classList.add("spark");
    wrap.style.width = W + "px";
    const vals = points.map((p) => p[1]);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const xOf = (i) => m.l + ((W - m.l - m.r) * i) / Math.max(1, vals.length - 1);
    const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo || 1));
    const up = vals[vals.length - 1] >= vals[0];
    const c = color || (up ? "var(--good)" : "var(--high)");
    el("path", { d: vals.map((v, i) => `${i ? "L" : "M"}${xOf(i).toFixed(1)},${y(v).toFixed(1)}`).join(""), fill: "none", style: `stroke:${c}`, "stroke-width": 2, "stroke-linejoin": "round" }, svg);
    const dot = el("circle", { r: 3.5, style: `fill:${c};stroke:var(--bg);stroke-width:2;opacity:0` }, svg);
    svg.setAttribute("aria-label", "One-year price trend");
    hover(wrap, svg, tip, W, vals.length, xOf,
      (i) => `<div class="faint">${new Date(points[i][0] * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div><b>₹${vals[i].toLocaleString("en-IN")}</b>`,
      (i) => { dot.style.opacity = i < 0 ? 0 : 1; if (i >= 0) { dot.setAttribute("cx", xOf(i)); dot.setAttribute("cy", y(vals[i])); } });
    return wrap;
  }

  /** Tiny inline trend for table rows (no hover; the row shows the numbers). */
  function micro(values, { width = 64, height = 18 } = {}) {
    const v = values.filter((x) => x != null);
    if (v.length < 2) return "";
    const lo = Math.min(...v), hi = Math.max(...v);
    const pts = v.map((x, i) => `${((width - 2) * i) / (v.length - 1) + 1},${height - 2 - ((height - 4) * (x - lo)) / (hi - lo || 1)}`).join(" ");
    const c = v[v.length - 1] > v[0] ? "var(--good)" : v[v.length - 1] < v[0] ? "var(--high)" : "var(--text-3)";
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${pts}" fill="none" style="stroke:${c}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }

  window.Charts = { bars, lines, spark, micro, shortNum };
})();
