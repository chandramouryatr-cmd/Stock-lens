/* Stock Lens — select any text to see its meaning or ask Claude about it, with a collapsible chat panel.
   Answers come from the local server (/api/ask), which holds the Anthropic API key. */
(function () {
  "use strict";
  const { $, $$, esc, S, TABS } = SL;
  const store = {
    get() { try { return JSON.parse(localStorage.getItem("sl-chat")) || {}; } catch (e) { return {}; } },
    set(v) { try { localStorage.setItem("sl-chat", JSON.stringify(v)); } catch (e) {} },
  };
  const saved = store.get();
  const C = { open: !!saved.open, msgs: Array.isArray(saved.msgs) ? saved.msgs.slice(-40) : [], busy: false, configured: null, unread: false };
  const persist = () => store.set({ open: C.open, msgs: C.msgs.filter((m) => !m.pending).slice(-40) });

  /* ---------------------------------------------------------------- markup */
  const SPARK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.1 6.4 6.4 2.1-6.4 2.1L12 19.5l-2.1-6.4L3.5 11l6.4-2.1z"/><path d="M19 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" opacity=".7"/></svg>';
  document.body.insertAdjacentHTML("beforeend", `
    <div class="selpop hidden" id="selpop" role="dialog" aria-label="Selected text">
      <button type="button" class="sp-btn" id="sp-mean">Meaning</button>
      <form class="sp-ask" id="sp-ask"><input id="sp-q" type="text" placeholder="Ask Claude about this…" autocomplete="off" spellcheck="true" aria-label="Your question about the selected text">
        <button type="submit" class="sp-send" aria-label="Ask Claude">${SPARK}</button></form>
    </div>
    <button class="askfab press" id="askfab" aria-controls="askp" aria-expanded="false">${SPARK}<span>Ask Claude</span><i class="askfab-dot hidden" id="askfab-dot"></i></button>
    <section class="askp hidden" id="askp" aria-label="Ask Claude">
      <header class="askp-head">
        <div class="askp-title">${SPARK}<div><b>Ask Claude</b><div class="faint" id="askp-ctx"></div></div></div>
        <button class="icon-btn" id="askp-new" title="New chat" aria-label="Start a new chat"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg></button>
        <button class="icon-btn" id="askp-min" title="Collapse" aria-label="Collapse the chat"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg></button>
      </header>
      <div class="askp-note hidden" id="askp-note"></div>
      <div class="askp-list" id="askp-list" aria-live="polite"></div>
      <form class="askp-form" id="askp-form">
        <textarea id="askp-q" rows="1" placeholder="Ask anything about this page…" aria-label="Your question"></textarea>
        <button type="submit" class="btn" id="askp-send">Send</button>
      </form>
    </section>`);

  /* ---------------------------------------------------------------- helpers */
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
  function md(text) {
    let html = "", list = null;
    for (const raw of esc(text).split("\n")) {
      const l = raw.trim(), m = l.match(/^([-*•]|\d+[.)])\s+(.*)$/);
      if (m) {
        const kind = /\d/.test(m[1]) ? "ol" : "ul";
        if (list !== kind) { if (list) html += `</${list}>`; html += `<${kind}>`; list = kind; }
        html += `<li>${inline(m[2])}</li>`;
        continue;
      }
      if (list) { html += `</${list}>`; list = null; }
      if (l) html += `<p>${inline(l)}</p>`;
    }
    return html + (list ? `</${list}>` : "");
  }
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1).trim() + "…" : s);

  // Glossary lookup: matches the key, the title, the words in brackets, or the title without them.
  function glossaryFor(text) {
    const t = text.toLowerCase().replace(/[“”"'’]/g, "").replace(/\s+/g, " ").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "").replace(/\s*%$/, "").trim();
    if (!t || t.length > 60) return null;
    for (const [k, v] of Object.entries(window.Glossary || {})) {
      const title = v[0].toLowerCase(), m = title.match(/^(.*?)\s*\((.*)\)$/);
      const names = [k, title, m && m[1], m && m[2]].filter(Boolean).map((x) => x.replace(/[^a-z0-9 /&-]/g, "").trim());
      if (names.includes(t) || names.includes(t.replace(/s$/, ""))) return v;
    }
    return null;
  }

  function pageName() {
    const h = location.hash.slice(1);
    if (S.company && h.startsWith("/c/")) return SL.shortName(S.company.name);
    return { "/screener": "Screener", "/portfolio": "Portfolio", "/compare": "Compare" }[h] || "Home";
  }

  // What Claude is told about the page, so "is this good?" can be answered for this company.
  function context(sel) {
    const L = [];
    const c = S.company;
    if (c && location.hash.startsWith("#/c/")) {
      L.push(`Company: ${c.name}${c.nse_symbol ? " (NSE: " + c.nse_symbol + ")" : ""}${c.bse_code ? " (BSE: " + c.bse_code + ")" : ""}. ${c.consolidated ? "Consolidated" : "Standalone"} figures.`);
      if ((c.sector || []).length) L.push("Sector: " + c.sector.map((s) => s.name).join(" > "));
      const tab = (TABS.find(([k]) => k === S.tab) || [])[1];
      if (tab) L.push("Open tab: " + tab);
      if ((c.ratios || []).length) L.push("Key ratios: " + c.ratios.map((r) => `${r.name} ${r.value}`).join("; "));
      if (S.score) L.push(`Stock Lens health check: ${S.score.passed} of ${S.score.total} passed — ` + S.score.checks.map((k) => `${k.label} ${k.value} (${k.status})`).join("; "));
      const tr = window.Score && Score.trend(c);
      if (tr) L.push(`Trend score (Piotroski-style, ${tr.from} vs ${tr.to}): ${tr.passed} of ${tr.total}`);
      if (S.price && S.price.points && S.price.points.length > 250) {
        const p = S.price.points, last = p[p.length - 1][1], yr = p[Math.max(0, p.length - 250)][1];
        L.push(`Share price ₹${last} (about ${((last / yr - 1) * 100).toFixed(0)}% over the past year)`);
      }
      if ((c.pros || []).length) L.push("Screener pros: " + c.pros.join("; "));
      if ((c.cons || []).length) L.push("Screener cons: " + c.cons.join("; "));
      if (c.about) L.push("About: " + short(c.about, 500));
    } else {
      L.push("Page: " + pageName() + " (no single company is open)");
    }
    if (sel) L.push(`He selected this text on the page: "${short(sel, 400)}"`);
    return L.join("\n");
  }

  /* ---------------------------------------------------------------- panel */
  const panel = $("#askp"), fab = $("#askfab"), list = $("#askp-list");
  function setOpen(open) {
    C.open = open;
    panel.classList.toggle("hidden", !open);
    fab.classList.toggle("hidden", open);
    fab.setAttribute("aria-expanded", String(open));
    if (open) { C.unread = false; $("#askfab-dot").classList.add("hidden"); $("#askp-ctx").textContent = "About: " + pageName(); render(); }
    persist();
  }
  fab.addEventListener("click", () => { setOpen(true); $("#askp-q").focus(); });
  $("#askp-min").addEventListener("click", () => setOpen(false));
  $("#askp-new").addEventListener("click", () => { if (C.busy) return; C.msgs = []; persist(); render(); $("#askp-q").focus(); });
  addEventListener("hashchange", () => { if (C.open) $("#askp-ctx").textContent = "About: " + pageName(); hidePop(); });

  const SETUP = `Claude isn't connected yet, so only the built-in meanings work. To turn Claude on:
1. Create an API key at console.anthropic.com (this needs an Anthropic account with credit).
2. Save the key as the only text in a file named **anthropic-key.txt** inside the stock-lens folder.
3. Close Stock Lens and start it again.`;

  function note() {
    const n = $("#askp-note");
    n.classList.toggle("hidden", C.configured !== false);
    n.innerHTML = C.configured === false ? `<b>Claude isn't connected yet.</b> Built-in meanings still work. Add an API key to ask anything — <button class="link-btn" id="askp-how">how</button>` : "";
    const how = $("#askp-how");
    if (how) how.addEventListener("click", () => { C.msgs.push({ role: "assistant", content: SETUP, local: true }); persist(); render(); });
  }

  function render() {
    note();
    if (!C.msgs.length) {
      list.innerHTML = `<div class="askp-empty">${SPARK}<p><b>Select any text on the page</b> to see what it means or to ask about it.</p><p class="faint">Or type a question below — Claude can see this page's key numbers.</p></div>`;
      return;
    }
    list.innerHTML = C.msgs.map((m, i) => {
      if (m.role === "user") return `<div class="msg user">${m.quote ? `<div class="quote">“${esc(short(m.quote, 220))}”</div>` : ""}<div>${esc(m.display || m.content)}</div></div>`;
      if (m.pending) return `<div class="msg bot typing" aria-label="Claude is writing"><i></i><i></i><i></i></div>`;
      if (m.err) return `<div class="msg bot err-msg">${md(m.content)}<button class="link-btn" data-retry="${i}">Try again</button></div>`;
      return `<div class="msg bot">${md(m.content)}${m.source ? `<div class="msg-src">${esc(m.source)}${m.more ? ` · <button class="link-btn" data-more="${i}">Ask Claude for more</button>` : ""}</div>` : ""}</div>`;
    }).join("");
    $$("[data-retry]", list).forEach((b) => b.addEventListener("click", () => { C.msgs.splice(+b.dataset.retry, 1); send(); }));
    $$("[data-more]", list).forEach((b) => b.addEventListener("click", () => {
      const m = C.msgs[+b.dataset.more];
      m.more = false;
      ask(`Explain "${m.term}" in more depth, and what it means for the company I'm looking at, if one is open.`, m.term, `Tell me more about “${m.term}”`);
    }));
    list.scrollTop = list.scrollHeight;
  }

  async function send() {
    if (C.busy) return;
    C.busy = true;
    const ctx = C.msgs.length ? C.msgs[C.msgs.length - 1].ctx : "";
    C.msgs.push({ role: "assistant", pending: true });
    render();
    $("#askp-send").disabled = true;
    let reply;
    try {
      const r = await fetch("/api/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: ctx, messages: C.msgs.filter((m) => !m.pending && !m.err && !(m.local && m.role === "assistant" && m.content === SETUP)).map((m) => ({ role: m.role, content: m.content })) }),
      });
      const j = await r.json().catch(() => ({ error: "Bad reply from Stock Lens" }));
      if (j.error === "NO_KEY") { C.configured = false; reply = { role: "assistant", content: SETUP, local: true }; }
      else if (!r.ok) reply = { role: "assistant", content: j.error || "Claude could not answer.", err: true };
      else { C.configured = true; reply = { role: "assistant", content: j.answer }; }
    } catch (e) {
      reply = { role: "assistant", content: "Could not reach Stock Lens. Is it still running?", err: true };
    }
    C.msgs = C.msgs.filter((m) => !m.pending);
    C.msgs.push(reply);
    C.busy = false;
    $("#askp-send").disabled = false;
    if (!C.open) { C.unread = true; $("#askfab-dot").classList.remove("hidden"); }
    persist();
    render();
  }

  // content = what Claude reads; display = what the bubble shows
  function ask(content, quote, display) {
    C.msgs.push({ role: "user", content: quote ? `About this text on the page: "${quote}"\n\n${content}` : content, display: display || content, quote, ctx: context(quote) });
    if (!C.open) setOpen(true);
    send();
  }

  function meaning(text) {
    const g = glossaryFor(text);
    C.msgs.push({ role: "user", content: `What does "${text}" mean?`, display: "What does this mean?", quote: text, ctx: context(text) });
    if (g) {
      C.msgs.push({ role: "assistant", content: `**${g[0]}** — ${g[1]}`, source: "From the Stock Lens glossary", more: true, term: text, local: true });
      if (!C.open) setOpen(true); else { persist(); render(); }
      return;
    }
    C.msgs.pop();
    ask(`What does "${text}" mean here? Explain it simply, and how it applies to what I'm looking at.`, text, "What does this mean?");
  }

  const ta = $("#askp-q");
  const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px"; };
  ta.addEventListener("input", grow);
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#askp-form").requestSubmit(); } });
  $("#askp-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = ta.value.trim();
    if (!q || C.busy) return;
    ta.value = ""; grow();
    ask(q);
  });

  /* ---------------------------------------------------------------- selection popup */
  const pop = $("#selpop");
  let selText = "", selTimer = 0;
  const touch = matchMedia("(pointer: coarse)").matches;
  function hidePop() { pop.classList.add("hidden"); }
  function inPop() { return pop.contains(document.activeElement); }
  function showPop() {
    const s = getSelection();
    const text = s && !s.isCollapsed ? s.toString().replace(/\s+/g, " ").trim() : "";
    if (!text || text.length > 600) { if (!inPop()) hidePop(); return; }
    const node = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement);
    if (!node || node.closest("#askp, #selpop, input, textarea, .toolbar, #ct-main, #ct-rsi")) return;
    selText = text;
    $("#sp-q").value = "";
    const r = s.getRangeAt(0).getBoundingClientRect();
    pop.classList.remove("hidden");
    const w = pop.offsetWidth, h = pop.offsetHeight, vw = document.documentElement.clientWidth;
    const left = Math.max(10, Math.min(vw - w - 10, r.left + r.width / 2 - w / 2));
    // Phones show their own copy menu above the text, so ours goes below.
    const above = !touch && r.top - h - 10 > 64;
    pop.style.left = left + "px";
    pop.style.top = (above ? r.top - h - 10 : Math.min(innerHeight - h - 10, r.bottom + 10)) + "px";
  }
  document.addEventListener("selectionchange", () => { clearTimeout(selTimer); selTimer = setTimeout(showPop, touch ? 450 : 220); });
  document.addEventListener("pointerdown", (e) => { if (!pop.contains(e.target)) hidePop(); }, true);
  addEventListener("scroll", () => { if (!inPop()) hidePop(); }, { passive: true });
  addEventListener("keydown", (e) => { if (e.key === "Escape") hidePop(); });
  $("#sp-mean").addEventListener("pointerdown", (e) => e.preventDefault()); // keep the selection while clicking
  $("#sp-mean").addEventListener("click", () => { hidePop(); meaning(selText); });
  $("#sp-ask").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#sp-q").value.trim();
    if (!q) { $("#sp-q").focus(); return; }
    hidePop();
    getSelection().removeAllRanges();
    ask(q, selText, q);
  });

  /* ---------------------------------------------------------------- start */
  fetch("/api/ask-status").then((r) => r.json()).then((j) => { C.configured = !!j.configured; if (C.open) note(); }).catch(() => {});
  setOpen(C.open);
})();
