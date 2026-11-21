/* Hidden previews (not linked anywhere yet):
   - #/plans : subscription cards for the Play Store version (prices only, no real payments)
   - #/tour  : a 4-step app tour for first-time users
   To open them: on the Portfolio page, tap the "Portfolio" title 5 times quickly. */
(function () {
  "use strict";
  const { esc, PAGES, go } = window.SL;

  /* ---------------------------------------------------------------- plans */
  const TRIAL_DAYS = 15;
  const PLANS = [
    { id: "day", name: "Day pass", price: 15, per: "24 hours", note: "One-time · doesn't renew", perDay: 15 },
    { id: "week", name: "Weekly", price: 70, per: "week", note: "Renews weekly · cancel anytime", perDay: 10 },
    { id: "month", name: "Monthly", price: 150, per: "month", note: `${TRIAL_DAYS} days free, then ₹150 a month`, perDay: 5, badge: "Most popular", trial: true },
    { id: "year", name: "Yearly", price: 850, per: "year", note: `${TRIAL_DAYS} days free, then ₹850 a year`, perDay: 2.3, badge: "Best value", save: "Save 53% vs monthly", trial: true },
  ];
  const FEATURES = [
    "Health check, chart & valuation for every NSE / BSE stock",
    "Watchlist with price-target alerts and the home-screen widget",
    "Market news sorted into positive and negative, with pinned stocks",
    "Sectors, commodities and the fear gauge",
    "Screener over the Nifty 500, Compare and Portfolio",
  ];
  let chosen = "year";

  PAGES["/plans"] = (view) => {
    document.title = "Plans · Stock Lens";
    const draw = () => {
      const p = PLANS.find((x) => x.id === chosen);
      view.innerHTML = `<div class="page-narrow plans">
        <div class="pl-preview">Preview · not live yet</div>
        <h1 class="pl-title">Get the full Stock Lens</h1>
        <div class="pl-trial"><b>${TRIAL_DAYS} days free</b> on Monthly and Yearly. Cancel before it ends and you pay nothing.</div>
        <div class="pl-list" role="radiogroup" aria-label="Plans">
          ${PLANS.map((x) => `<button class="pl-card ${x.id === chosen ? "on" : ""}" role="radio" aria-checked="${x.id === chosen}" data-plan="${x.id}">
            ${x.badge ? `<span class="pl-badge ${x.id}">${x.badge}</span>` : ""}
            <span class="pl-radio" aria-hidden="true"></span>
            <span class="pl-main"><b>${x.name}</b><small>${esc(x.note)}</small></span>
            <span class="pl-price"><b>₹${x.price}</b><small>per ${x.per}</small>${x.perDay < 15 ? `<em>≈ ₹${x.perDay % 1 ? x.perDay.toFixed(1) : x.perDay}/day</em>` : ""}</span>
            ${x.save ? `<span class="pl-save">${x.save}</span>` : ""}
          </button>`).join("")}
        </div>
        <button class="btn pl-cta" id="pl-cta">${p.trial ? `Start ${TRIAL_DAYS}-day free trial` : `Buy ${p.name.toLowerCase()} · ₹${p.price}`}</button>
        <p class="pl-fine">${p.trial ? `Free for ${TRIAL_DAYS} days, then ₹${p.price} per ${p.per}. ` : ""}Payments through Google Play. ${p.id === "day" ? "Gives full access for 24 hours, then stops." : "Cancel anytime in Play Store → Subscriptions."}</p>
        <div class="card pl-feat"><h2>Every plan includes</h2><ul>${FEATURES.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>
        <p class="pl-fine">Stock Lens is a research tool, not investment advice.</p>
      </div>`;
      view.querySelectorAll("[data-plan]").forEach((b) => b.addEventListener("click", () => { chosen = b.dataset.plan; draw(); }));
      view.querySelector("#pl-cta").addEventListener("click", (e) => {
        e.currentTarget.textContent = "Payments arrive with the Play Store version";
        e.currentTarget.disabled = true;
      });
    };
    draw();
  };

  /* ---------------------------------------------------------------- 4-step tour */
  const ICONS = {
    search: '<circle cx="21" cy="21" r="11"/><path d="M29.5 29.5L38 38"/>',
    star: '<path d="M24 7l5.2 10.8 11.8 1.6-8.6 8.2 2.1 11.8L24 33.8 13.5 39.4l2.1-11.8L7 19.4l11.8-1.6z"/>',
    chart: '<path d="M7 38h34"/><path d="M10 31l9-9 7 7 13-14"/><path d="M31 15h8v8"/>',
    layers: '<path d="M24 8L6 17l18 9 18-9z"/><path d="M6 25l18 9 18-9"/><path d="M6 33l18 9 18-9"/>',
  };
  const STEPS = [
    { icon: "search", title: "Look up any stock", text: "Search a company by name or NSE symbol. See its health check, chart, financials, owners, people and news on one page, with an “i” next to every hard word." },
    { icon: "star", title: "Follow your stocks", text: "Add stocks to your Watchlist to see live prices. Set a target price and get a notification when it's reached, and keep the widget on your home screen." },
    { icon: "chart", title: "Read the market", text: "Home sorts today's news into good and bad for Indian shares. Markets shows which sectors are up or down, gold and oil in rupees, and how nervous traders are." },
    { icon: "layers", title: "Find and compare", text: "Use Screener to find companies that pass your own rules, Compare to put four side by side, and Portfolio to track what you own." },
  ];
  let step = 0;
  PAGES["/tour"] = (view) => {
    document.title = "Tour · Stock Lens";
    step = 0;
    const draw = () => {
      const s = STEPS[step], last = step === STEPS.length - 1;
      view.innerHTML = `<div class="page-narrow tour">
        <div class="pl-preview">Preview · not live yet</div>
        <div class="tour-card card fade-in">
          <div class="tour-step">Step ${step + 1} of ${STEPS.length}</div>
          <div class="tour-art"><svg viewBox="0 0 48 48" aria-hidden="true">${ICONS[s.icon]}</svg></div>
          <h2>${esc(s.title)}</h2>
          <p>${esc(s.text)}</p>
          <div class="tour-dots">${STEPS.map((_, i) => `<i class="${i === step ? "on" : ""}"></i>`).join("")}</div>
          <div class="tour-btns">
            ${step ? `<button class="btn secondary" id="tour-back">Back</button>` : `<button class="linkish" id="tour-skip">Skip</button>`}
            <button class="btn" id="tour-next">${last ? "Get started" : "Next"}</button>
          </div>
        </div></div>`;
      const nx = view.querySelector("#tour-next"), bk = view.querySelector("#tour-back"), sk = view.querySelector("#tour-skip");
      nx.addEventListener("click", () => { if (last) location.hash = "#/"; else { step++; draw(); } });
      if (bk) bk.addEventListener("click", () => { step--; draw(); });
      if (sk) sk.addEventListener("click", () => { location.hash = "#/"; });
    };
    draw();
  };

  /* ---------------------------------------------------------------- the hidden way in */
  // On the Portfolio page, 5 quick taps on the "Portfolio" title show a small "Preview" row.
  let taps = 0, tapT = 0;
  document.addEventListener("click", (e) => {
    if (location.hash !== "#/portfolio") return;
    const h = e.target.closest("#view .co-head h1");
    if (!h) return;
    taps++; clearTimeout(tapT); tapT = setTimeout(() => (taps = 0), 1500);
    if (taps < 5 || document.getElementById("pv-row")) return;
    taps = 0;
    h.insertAdjacentHTML("afterend", `<div class="pv-row" id="pv-row">Preview: <a href="#/plans">Plans</a> · <a href="#/tour">App tour</a></div>`);
  });
  void go;
})();
