/* Rule-based risk checks. Every rule shows its evidence; nothing here is a buy/sell call. */
(function () {
  const ORDER = { high: 0, medium: 1, low: 2, info: 3, good: 4 };
  const r1 = (v) => Math.round(v * 10) / 10;

  function rowOf(tbl, label) {
    if (!tbl) return null;
    const l = label.toLowerCase();
    return tbl.rows.find((r) => r.label.toLowerCase() === l) || tbl.rows.find((r) => r.label.toLowerCase().startsWith(l));
  }
  const lastNum = (arr, offset = 0) => {
    const v = (arr || []).filter((x) => x != null);
    return v.length > offset ? v[v.length - 1 - offset] : null;
  };
  const growthVal = (c, title, period) => {
    const g = (c.growth || []).find((x) => x.title.toLowerCase().includes(title));
    const row = g && g.rows.find((r) => r[0].toLowerCase().startsWith(period));
    return row ? parseFloat(row[1]) : null;
  };

  function parseDate(s) {
    if (!s) return null;
    const d = new Date(s.replace(/^(\d{1,2})-(\w{3})-(\d{4})$/, "$2 $1, $3"));
    return isNaN(d) ? null : d;
  }

  function compute(S) {
    const c = S.company;
    const out = [];
    if (!c) return out;
    const add = (level, area, title, detail, source) => out.push({ level, area, title, detail, source });
    const T = c.tables || {};
    const sectorText = (c.sector || []).map((s) => s.name).join(" ");
    const isFin = /bank|financ|nbfc|insurance|lending|housing fin/i.test(sectorText);

    // ---------- Ownership ----------
    const shp = c.shareholding;
    const sr = (n) => rowOf(shp, n);
    const prom = sr("Promoters");
    if (prom) {
      const v = prom.values.filter((x) => x != null);
      const last = v[v.length - 1], ago = v.length >= 5 ? v[v.length - 5] : v[0];
      const d = last - ago;
      if (!last) add("info", "Ownership", "No promoter group", "No identified promoter holds shares. Control sits with the board and institutions — check who could gain control.", "Screener shareholding");
      else if (last < 26) add("medium", "Ownership", `Low promoter stake (${r1(last)}%)`, "Below 26%, promoters cannot block special resolutions alone, and control is easier to contest.", "Screener shareholding");
      if (last && d <= -3) add("high", "Ownership", `Promoters sold ${r1(-d)} percentage points in a year`, `Promoter holding fell from ${r1(ago)}% to ${r1(last)}%. Find out why (debt repayment, pledge invocation, exit).`, "Screener shareholding");
      else if (last && d <= -1) add("medium", "Ownership", `Promoter stake slipping (−${r1(-d)} pts in a year)`, `From ${r1(ago)}% to ${r1(last)}%.`, "Screener shareholding");
      else if (last && d >= 1) add("good", "Ownership", `Promoters added ${r1(d)} pts in a year`, `From ${r1(ago)}% to ${r1(last)}% — insiders buying is usually a confidence signal.`, "Screener shareholding");
    }
    const inst = ["FIIs", "DIIs"].map(sr).filter(Boolean);
    if (inst.length) {
      const sum = (off) => inst.reduce((a, r) => a + (lastNum(r.values, off) || 0), 0);
      const d = sum(0) - sum(4);
      if (d <= -3) add("medium", "Ownership", `Institutions reduced holding by ${r1(-d)} pts in a year`, "Foreign and domestic funds together have been selling.", "Screener shareholding");
      else if (d >= 3) add("good", "Ownership", `Institutions added ${r1(d)} pts in a year`, "Foreign and domestic funds together have been buying.", "Screener shareholding");
    }
    const pub = sr("Public");
    if (pub) {
      const d = (lastNum(pub.values) || 0) - (lastNum(pub.values, 4) || 0);
      if (d >= 5) add("low", "Ownership", `Retail ownership up ${r1(d)} pts in a year`, "Retail share often rises when better-informed holders are exiting. Check who sold.", "Screener shareholding");
    }
    if ((c.exited_holders || []).length) {
      add("info", "Ownership", `${c.exited_holders.length} notable holder(s) no longer listed above 1%`,
        c.exited_holders.map((h) => `${h.name} (peak ${h.peak}%)`).join("; ") + ". Some are just name changes — verify before reading into it.", "Screener shareholding");
    }

    // ---------- Balance sheet ----------
    const bs = T["balance-sheet"], pl = T["profit-loss"], cf = T["cash-flow"], q = T["quarters"];
    if (isFin) {
      add("info", "Balance sheet", "Financial company — debt checks skipped", "For banks and NBFCs borrowing is the raw material. Look at asset quality (GNPA/NNPA), capital adequacy and credit costs in the annual report instead.", "Sector");
    } else if (bs) {
      const b = lastNum(rowOf(bs, "Borrowings")?.values);
      const eq = (lastNum(rowOf(bs, "Equity Capital")?.values) || 0) + (lastNum(rowOf(bs, "Reserves")?.values) || 0);
      if (b != null && eq > 0) {
        const de = b / eq;
        if (de > 1) add("high", "Balance sheet", `High debt: debt/equity ${de.toFixed(2)}`, `Borrowings ₹${Math.round(b).toLocaleString("en-IN")} Cr against net worth ₹${Math.round(eq).toLocaleString("en-IN")} Cr.`, "Screener balance sheet");
        else if (de > 0.5) add("medium", "Balance sheet", `Moderate debt: debt/equity ${de.toFixed(2)}`, `Borrowings ₹${Math.round(b).toLocaleString("en-IN")} Cr.`, "Screener balance sheet");
        else if (de < 0.1) add("good", "Balance sheet", "Almost debt-free", `Debt/equity ${de.toFixed(2)}.`, "Screener balance sheet");
      }
      if (eq <= 0) add("high", "Balance sheet", "Negative net worth", "Accumulated losses have wiped out shareholder equity.", "Screener balance sheet");
      const op = lastNum(rowOf(pl, "Operating Profit")?.values), oi = lastNum(rowOf(pl, "Other Income")?.values) || 0;
      const intr = lastNum(rowOf(pl, "Interest")?.values);
      if (op != null && intr > 0) {
        const cov = (op + oi) / intr;
        if (cov < 1.5) add("high", "Balance sheet", `Weak interest cover (${cov.toFixed(1)}×)`, "Operating profit barely covers interest. A bad year could strain repayments.", "Screener P&L (TTM)");
        else if (cov < 3) add("medium", "Balance sheet", `Thin interest cover (${cov.toFixed(1)}×)`, "Less than 3× cushion over interest cost.", "Screener P&L (TTM)");
      }
    }

    // ---------- Profitability & cash ----------
    if (pl) {
      const np = rowOf(pl, "Net Profit")?.values || [];
      const lastNp = lastNum(np);
      if (lastNp != null && lastNp < 0) add("high", "Profitability", "Loss-making (latest 12 months)", `Net loss of ₹${Math.round(-lastNp).toLocaleString("en-IN")} Cr.`, "Screener P&L");
      const yrs = np.slice(-6, -1).filter((x) => x != null); // last 5 full years (skip TTM)
      const lossYears = yrs.filter((x) => x < 0).length;
      if (lossYears >= 2) add("medium", "Profitability", `Losses in ${lossYears} of the last 5 years`, "Earnings are unstable.", "Screener P&L");
      const opm = rowOf(pl, "OPM")?.values || [];
      const o1 = lastNum(opm), o4 = lastNum(opm, 3);
      if (o1 != null && o4 != null && o4 - o1 >= 5) add("medium", "Profitability", `Operating margin down ${r1(o4 - o1)} pts in 3 years`, `From ${o4}% to ${o1}% — pricing power or costs are under pressure.`, "Screener P&L");
      if (cf && !isFin) {
        const cfo = (rowOf(cf, "Cash from Operating")?.values || []).slice(-5).filter((x) => x != null);
        const npSum = yrs.reduce((a, b) => a + b, 0), cfoSum = cfo.reduce((a, b) => a + b, 0);
        if (npSum > 0 && cfo.length >= 3) {
          const ratio = cfoSum / npSum;
          if (ratio < 0.6) add("high", "Cash flow", `Profits not turning into cash (${Math.round(ratio * 100)}%)`, `Over ~5 years, operating cash ₹${Math.round(cfoSum).toLocaleString("en-IN")} Cr vs reported profit ₹${Math.round(npSum).toLocaleString("en-IN")} Cr. Can signal aggressive accounting or stuck receivables.`, "Screener cash flow");
          else if (ratio < 0.85) add("medium", "Cash flow", `Cash conversion is soft (${Math.round(ratio * 100)}%)`, "Operating cash trails reported profit over ~5 years.", "Screener cash flow");
          else if (ratio > 1) add("good", "Cash flow", `Strong cash conversion (${Math.round(ratio * 100)}%)`, "Operating cash exceeds reported profit over ~5 years.", "Screener cash flow");
        }
      }
    }
    const sg3 = growthVal(c, "sales", "3 years"), pg3 = growthVal(c, "profit", "3 years");
    if (sg3 != null && sg3 < 0) add("medium", "Growth", `Sales shrinking (${sg3}% a year over 3 years)`, "", "Screener growth");
    if (pg3 != null && pg3 < 0) add("medium", "Growth", `Profit shrinking (${pg3}% a year over 3 years)`, "", "Screener growth");
    if (q) {
      const nq = rowOf(q, "Net Profit")?.values || [];
      const a = lastNum(nq), b = lastNum(nq, 4);
      if (a != null && b > 0 && (a - b) / b <= -0.25) add("medium", "Latest quarter", `Quarterly profit down ${Math.round(((b - a) / b) * 100)}% year-on-year`, `₹${Math.round(a).toLocaleString("en-IN")} Cr vs ₹${Math.round(b).toLocaleString("en-IN")} Cr in the same quarter last year.`, "Screener quarterly results");
    }

    // ---------- Valuation vs peers ----------
    const pe = (c.ratios || []).find((r) => /P\/E/.test(r.name))?.num;
    const peerPE = (c.peers || []).filter((p) => p.path !== c.path && p["P/E"] > 0).map((p) => p["P/E"]).sort((a, b) => a - b);
    if (pe > 0 && peerPE.length >= 3) {
      const med = peerPE[Math.floor(peerPE.length / 2)];
      if (pe / med > 1.5) add("low", "Valuation", `Priced well above peers (P/E ${pe} vs median ${med})`, "Expectations are high; a disappointment can hit the price harder.", "Screener peers");
      else if (pe / med < 0.67) add("info", "Valuation", `Priced below peers (P/E ${pe} vs median ${med})`, "Cheap can mean opportunity — or that the market sees a problem. Find out which.", "Screener peers");
    }
    (c.cons || []).forEach((t) => add("low", "Screener checklist", t, "", "Screener (machine-generated)"));
    (c.pros || []).forEach((t) => add("good", "Screener checklist", t, "", "Screener (machine-generated)"));

    // ---------- Related parties ----------
    const rp = (c.related_parties && c.related_parties.parties) || [];
    if (rp.length) {
      const money = rp.filter((p) => p.transactions.some((t) => /loan|guarantee|advance given|security given|investment in|inter.?corporate/i.test(t)));
      if (money.length) add("medium", "Related parties", `Loans, guarantees or investments with ${money.length} related part${money.length > 1 ? "ies" : "y"}`,
        money.slice(0, 5).map((p) => p.name).join(", ") + ". Money flowing to group entities is a classic place for value leakage — check the amounts in the annual report.", "Screener related-party (annual reports)");
      add("info", "Related parties", `${rp.length} related part${rp.length > 1 ? "ies" : "y"} on record`, "Group companies, parent and subsidiaries the company transacts with. See the Owners tab.", "Screener related-party");
    }

    // ---------- People ----------
    const P = S.people;
    if (P && P.found) {
      if (P.status && !/^active$/i.test(P.status)) add("high", "Registry", `Company status: ${P.status}`, "As recorded with the Ministry of Corporate Affairs.", "ZaubaCorp / MCA");
      const now = Date.now();
      (P.directors || []).forEach((d) => {
        const n = (d.current || []).length;
        const nm = titleCase(d.name);
        if (n > 12) add("low", "People", `${nm} sits on ${n} boards`, "Very busy directors have less time for oversight of each company.", "ZaubaCorp / MCA");
        const ap = parseDate(d.appointed);
        if (ap && /managing|ceo|whole|executive|chief/i.test(d.designation || "") && now - ap < 365 * 864e5)
          add("info", "People", `New in role: ${nm} (${d.designation})`, `Appointed ${ap.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}. Leadership changes can shift strategy.`, "ZaubaCorp / MCA");
        const struck = [...(d.current || [])].filter((x) => x.status && /strike|liquidat|dissolv/i.test(x.status));
        if (struck.length) add("medium", "People", `${nm} linked to ${struck.length} struck-off/liquidated compan${struck.length > 1 ? "ies" : "y"}`, struck.map((x) => titleCase(x.name)).join(", "), "ZaubaCorp / MCA");
      });
      const recentExit = (P.directors || []).length && (P.past_officers || []).length;
      if (recentExit && P.past_officers.length > 25) add("info", "People", `${P.past_officers.length} former directors/officers on record`, "High board turnover over the company's life. Check recent exits and reasons in exchange filings.", "ZaubaCorp / MCA");
    }

    // ---------- News ----------
    // One line per entity: merge the normal feed with its risk-scan feed, de-duplicated by link.
    const byEntity = {};
    for (const [key, n] of Object.entries(S.news || {})) {
      if (!n || !n.items) continue;
      const base = key.replace(/^scan:/, "");
      const e = (byEntity[base] = byEntity[base] || { label: n.label, scan: false, items: [], seen: new Set() });
      e.scan = e.scan || !!n.scan;
      for (const it of n.items) if (!e.seen.has(it.link)) { e.seen.add(it.link); e.items.push(it); }
    }
    for (const n of Object.values(byEntity)) {
      n.items.sort((a, b) => b.ts - a.ts);
      const hi = n.items.filter((i) => i.risk === 3), md = n.items.filter((i) => i.risk === 2);
      const show = (arr) => arr.slice(0, 3).map((i) => `“${i.title}”`).join(" · ");
      const who = n.label.replace(" · risk scan", "");
      const src = n.scan ? "Google News — latest 12 months + risk search over 3 years" : "Google News (last 12 months)";
      const note = " — flagged by keywords, which can't tell an allegation from a dismissal. Read the stories.";
      if (hi.length) add("high", "News", `${hi.length} serious-sounding headline${hi.length > 1 ? "s" : ""} about ${who}`, show(hi) + note, src);
      else if (md.length >= 2) add("medium", "News", `${md.length} cautionary headlines about ${who}`, show(md) + note, src);
    }

    return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  }

  function titleCase(s) {
    return String(s || "").toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
  }

  window.Risk = { compute, parseDate, titleCase, ORDER };
})();
