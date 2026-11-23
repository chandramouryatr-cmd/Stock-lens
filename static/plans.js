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
  // The one message, used on the tour, this page and the Play Store listing.
  const ONE_LINE = "Check any Indian stock in 2 minutes before you buy.";
  // What YOU get (outcomes), not a list of our features.
  const FEATURES = [
    "See a company's debt, profits, owners and people on one screen",
    "Spot red flags early: promoters selling, probes, raids, defaults in the news",
    "Get a notification the moment your stock hits your target price",
    "Know each morning if the news is good or bad for Indian shares",
    "Find companies that pass your own rules, and compare up to four",
  ];
  let chosen = "year";

  PAGES["/plans"] = (view) => {
    document.title = "Plans · Stock Lens";
    const draw = () => {
      const p = PLANS.find((x) => x.id === chosen);
      view.innerHTML = `<div class="page-narrow plans">
        <div class="pl-preview">Preview · not live yet</div>
        <h1 class="pl-title">Never buy a stock blind again</h1>
        <p class="pl-lede">Rising debt, promoters quietly selling, a probe in the news: check it all in 2 minutes, before your money goes in.</p>
        <div class="pl-story">
          <div class="pl-story-k">Real example · 18 Nov 2026</div>
          <p>When Fairfax announced it would sell its entire 13% stake in <b>IIFL Finance</b>, the stock's News tab showed it within the hour, marked <span class="impact neg">▼ Likely negative</span>.</p>
        </div>
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
        <div class="card pl-feat"><h2>With any plan, you can</h2><ul>${FEATURES.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>
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
    tabs: '<rect x="6" y="10" width="36" height="28" rx="4"/><path d="M6 17h36"/><path d="M12 13.5h.01M17 13.5h.01M22 13.5h.01"/><path d="M14 25h20M14 31h12"/>',
    alert: '<path d="M24 7L43 40H5z"/><path d="M24 19v9"/><path d="M24 33.5v.01"/>',
    search: '<circle cx="21" cy="21" r="11"/><path d="M29.5 29.5L38 38"/>',
    check: '<circle cx="24" cy="24" r="17"/><path d="M16 24.5l5.5 5.5L32 19"/>',
  };
  // A story, not a feature list: problem → stakes → turning point → the "after", then one next step.
  const STEPS = [
    { icon: "tabs", kicker: "Sound familiar?", title: "A stock tip lands in your WhatsApp",
      text: "Checking it properly means Screener, Moneycontrol, the news, the annual report… six tabs and an hour you don't have. So most people just go by the tip." },
    { icon: "alert", kicker: "What it can cost", title: "The one thing you didn't see",
      text: "Debt quietly piling up. Promoters selling their shares. A probe or a raid in last month's news. Find out after you've bought, and your money pays for it." },
    { icon: "search", kicker: "Now", title: "One search. One page.",
      text: "Type the company's name. Its health check, owners, people and every red-flag headline are on one screen, with a plain-English “i” next to every hard word." },
    { icon: "check", kicker: "After", title: "Know before you buy",
      text: "In 2 minutes you know whether a stock is worth a closer look or worth walking away from. Your call, with the facts in front of you." },
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
          <div class="tour-step">${esc(s.kicker)}</div>
          <div class="tour-art ${s.icon}"><svg viewBox="0 0 48 48" aria-hidden="true">${ICONS[s.icon]}</svg></div>
          <h2>${esc(s.title)}</h2>
          <p>${esc(s.text)}</p>
          ${last ? `<p class="tour-one">${esc(ONE_LINE)}</p>` : ""}
          <div class="tour-dots">${STEPS.map((_, i) => `<i class="${i === step ? "on" : ""}"></i>`).join("")}</div>
          <div class="tour-btns">
            ${step ? `<button class="btn secondary" id="tour-back">Back</button>` : `<button class="linkish" id="tour-skip">Skip</button>`}
            <button class="btn" id="tour-next">${last ? "Check your first stock" : "Next"}</button>
          </div>
        </div></div>`;
      const nx = view.querySelector("#tour-next"), bk = view.querySelector("#tour-back"), sk = view.querySelector("#tour-skip");
      // Last step: go straight to the search box with the cursor in it.
      nx.addEventListener("click", () => {
        if (!last) { step++; draw(); return; }
        location.hash = "#/";
        setTimeout(() => { const q = document.getElementById("q"); if (q) q.focus(); }, 300);
      });
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
