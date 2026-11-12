/* Health check: the same fixed, transparent rules for every company.
   It counts how many plain fundamental checks a company passes — it is not a buy/sell call. */
(function () {
  const rowOf = (tbl, label) => {
    if (!tbl) return null;
    const l = label.toLowerCase();
    return tbl.rows.find((r) => r.label.toLowerCase() === l) || tbl.rows.find((r) => r.label.toLowerCase().startsWith(l));
  };
  const lastNum = (arr, offset = 0) => {
    const v = (arr || []).filter((x) => x != null);
    return v.length > offset ? v[v.length - 1 - offset] : null;
  };
  const growthVal = (c, title, period) => {
    const g = (c.growth || []).find((x) => x.title.toLowerCase().includes(title));
    const row = g && g.rows.find((r) => r[0].toLowerCase().startsWith(period));
    const v = row ? parseFloat(row[1]) : NaN;
    return isNaN(v) ? null : v;
  };
  const pct = (v, d = 0) => (v == null ? "—" : (+v.toFixed(d)) + "%");
  // higher is better: pass at >= a, watch at >= b
  const hi = (v, a, b) => (v == null ? "na" : v >= a ? "pass" : v >= b ? "watch" : "fail");
  // lower is better: pass at <= a, watch at <= b
  const lo = (v, a, b) => (v == null ? "na" : v <= a ? "pass" : v <= b ? "watch" : "fail");

  function compute(c) {
    const T = c.tables || {}, pl = T["profit-loss"], bs = T["balance-sheet"], cf = T["cash-flow"], q = T.quarters;
    const sectorText = (c.sector || []).map((s) => s.name).join(" ");
    const isFin = /bank|financ|nbfc|insurance|lending|housing fin/i.test(sectorText);
    const ratio = (re) => { const r = (c.ratios || []).find((x) => re.test(x.name)); return r && r.num != null ? r.num : null; };
    const checks = [];
    const add = (key, label, status, value, rule, why) => checks.push({ key, label, status, value, rule, why });

    // 1. Returns on money used
    const roce = ratio(/^ROCE/i), roe = ratio(/^ROE/i);
    if (isFin) add("returns", "Return on equity", hi(roe, 14, 10), pct(roe, 1), "Pass at 14% or more", "For lenders, ROE shows how much profit each rupee of owners' money earns.");
    else add("returns", "Return on capital", hi(roce, 15, 10), pct(roce, 1), "Pass at 15% or more", "ROCE shows how much profit the business earns on all the money put into it.");

    // 2-3. Growth
    const s5 = growthVal(c, "sales", "5 years"), p5 = growthVal(c, "profit", "5 years");
    add("sales", "Sales growth, 5 yrs", hi(s5, 10, 5), pct(s5), "Pass at 10% a year or more", "Steady sales growth means the business itself is getting bigger.");
    add("profit", "Profit growth, 5 yrs", hi(p5, 10, 5), pct(p5), "Pass at 10% a year or more", "Profit should grow at least as fast as a fixed deposit would.");

    // 4. Debt
    let de = null;
    if (!isFin && bs) {
      const b = lastNum((rowOf(bs, "Borrowings") || {}).values);
      const eq = (lastNum((rowOf(bs, "Equity Capital") || {}).values) || 0) + (lastNum((rowOf(bs, "Reserves") || {}).values) || 0);
      if (b != null && eq > 0) de = b / eq;
      else if (b != null && eq <= 0) de = 99;
    }
    add("debt", "Debt to equity", isFin ? "na" : lo(de, 0.5, 1), isFin ? "n/a" : de == null ? "—" : de >= 99 ? "neg. equity" : de.toFixed(2),
      "Pass at 0.5 or less", isFin ? "Skipped for banks and lenders — borrowing is their raw material." : "Low debt means a bad year is less likely to become a crisis.");

    // 5. Cash conversion
    let cash = null;
    if (!isFin && pl && cf) {
      const np = ((rowOf(pl, "Net Profit") || {}).values || []).slice(-6, -1).filter((x) => x != null);
      const cfo = ((rowOf(cf, "Cash from Operating") || {}).values || []).slice(-5).filter((x) => x != null);
      const a = np.reduce((x, y) => x + y, 0), b = cfo.reduce((x, y) => x + y, 0);
      if (a > 0 && cfo.length >= 3) cash = (b / a) * 100;
    }
    add("cash", "Profit turned into cash", isFin ? "na" : hi(cash, 85, 60), isFin ? "n/a" : pct(cash), "Pass at 85% or more",
      isFin ? "Skipped for banks and lenders — cash flow works differently for them." : "Over 5 years, cash from operations should be close to reported profit.");

    // 6. Promoters
    const prom = rowOf(c.shareholding, "Promoters");
    let pd = null, pLast = null;
    if (prom) {
      const v = prom.values.filter((x) => x != null);
      pLast = v[v.length - 1];
      if (pLast) pd = Math.round((pLast - (v.length >= 5 ? v[v.length - 5] : v[0])) * 10) / 10 || 0;
    }
    add("promoter", "Promoter stake, 1 yr", pd == null ? "na" : hi(pd, -0.5, -2), pd == null ? "no promoter" : (pd > 0 ? "+" : "") + pd.toFixed(1) + " pts",
      "Pass if not falling", pd == null ? "No promoter group, so this check does not apply." : `Promoters hold ${pLast.toFixed(1)}%. Owners selling down is worth a question.`);

    // 7. Latest quarter
    let qy = null;
    if (q) {
      const nq = (rowOf(q, "Net Profit") || {}).values || [];
      const a = lastNum(nq), b = lastNum(nq, 4);
      if (a != null && b > 0) qy = ((a - b) / b) * 100;
    }
    add("quarter", "Latest quarter profit", hi(qy, 0, -15), qy == null ? "—" : (qy > 0 ? "+" : "") + pct(qy), "Pass if up on last year", "Compared with the same quarter one year ago.");

    // 8. Price paid for earnings
    const pe = ratio(/P\/E/i);
    add("price", "Price to earnings", pe != null && pe <= 0 ? "fail" : lo(pe, 25, 45), pe == null ? "—" : pe.toFixed(1), "Pass at 25 or less",
      "How many years of current profit the share price equals. Higher means more is already expected.");

    const live = checks.filter((x) => x.status !== "na");
    const passed = live.filter((x) => x.status === "pass").length;
    const failed = live.filter((x) => x.status === "fail").length;
    const share = live.length ? passed / live.length : 0;
    return {
      checks, passed, failed, total: live.length, share, isFin,
      tone: !live.length ? "info" : share >= 0.75 && !failed ? "good" : share >= 0.5 ? "medium" : "high",
      m: { ret: isFin ? roe : roce, s5, p5, de: de != null && de < 99 ? de : null, pe, mcap: ratio(/Market Cap/i),
        dy: ratio(/Dividend Yield/i), prom: pLast, qy, cash, price: ratio(/Current Price/i) },
    };
  }

  /* Trend score: is the business getting financially stronger year on year?
     Based on the Piotroski F-score. The free data has no current ratio, so 8 of the 9 points are used. */
  function trend(c) {
    const T = c.tables || {}, pl = T["profit-loss"], bs = T["balance-sheet"], cf = T["cash-flow"];
    const sectorText = (c.sector || []).map((s) => s.name).join(" ");
    if (/bank|financ|nbfc|insurance|lending|housing fin/i.test(sectorText) || !pl || !bs || !cf) return null;
    const years = pl.headers.filter((h) => h !== "TTM");
    const y1 = years[years.length - 1], y0 = years[years.length - 2];
    if (!y0) return null;
    const at = (tbl, label, yr) => { const r = rowOf(tbl, label), i = tbl.headers.indexOf(yr); return r && i >= 0 ? r.values[i] : null; };
    const g = (tbl, label) => [at(tbl, label, y0), at(tbl, label, y1)];
    const [np0, np1] = g(pl, "Net Profit"), [s0, s1] = g(pl, "Sales"), [o0, o1] = g(pl, "OPM");
    const [a0, a1] = g(bs, "Total Assets"), [b0, b1] = g(bs, "Borrowings"), [e0, e1] = g(bs, "Equity Capital");
    const cfo1 = at(cf, "Cash from Operating", y1);
    const ok = (...v) => v.every((x) => x != null);
    const r = (x, d = 1) => +x.toFixed(d);
    const items = [];
    const add = (label, pass, detail) => items.push({ label, pass, detail });
    add("Made a profit", ok(np1) ? np1 > 0 : null, ok(np1) ? `₹${Math.round(np1).toLocaleString("en-IN")} Cr` : "");
    add("Operations brought in cash", ok(cfo1) ? cfo1 > 0 : null, ok(cfo1) ? `₹${Math.round(cfo1).toLocaleString("en-IN")} Cr` : "");
    add("Cash beat reported profit", ok(cfo1, np1) ? cfo1 > np1 : null, "Harder to fake cash than profit");
    add("Earned more on its assets", ok(np0, np1, a0, a1) && a0 > 0 && a1 > 0 ? np1 / a1 > np0 / a0 : null, ok(np0, np1, a0, a1) && a0 > 0 && a1 > 0 ? `${r((np0 / a0) * 100)}% → ${r((np1 / a1) * 100)}%` : "");
    add("Debt load did not rise", ok(b0, b1, a0, a1) && a0 > 0 && a1 > 0 ? b1 / a1 <= b0 / a0 + 0.001 : null, ok(b0, b1, a0, a1) && a0 > 0 && a1 > 0 ? `${r((b0 / a0) * 100)}% → ${r((b1 / a1) * 100)}% of assets` : "");
    add("No new shares issued", ok(e0, e1) ? e1 <= e0 * 1.02 : null, "New shares shrink each owner's slice");
    add("Operating margin improved", ok(o0, o1) ? o1 > o0 : null, ok(o0, o1) ? `${o0}% → ${o1}%` : "");
    add("Sold more per rupee of assets", ok(s0, s1, a0, a1) && a0 > 0 && a1 > 0 ? s1 / a1 > s0 / a0 : null, ok(s0, s1, a0, a1) && a0 > 0 && a1 > 0 ? `${r(s0 / a0, 2)} → ${r(s1 / a1, 2)}` : "");
    const live = items.filter((x) => x.pass != null);
    if (live.length < 5) return null;
    const passed = live.filter((x) => x.pass).length;
    return { items, passed, total: live.length, from: y0, to: y1, tone: passed / live.length >= 0.75 ? "good" : passed / live.length >= 0.5 ? "medium" : "high" };
  }

  window.Score = { compute, trend };
})();
