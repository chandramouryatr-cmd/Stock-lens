# Stock Lens

A personal tool for fundamental analysis of Indian listed stocks, built on free public data. Search a company to see its numbers, owners, people, news and risks in one place, then use the screener, portfolio and compare pages to weigh it against others.

For personal research only. Not investment advice.

## Run it

Needs Python 3.10 or newer.

```
pip install -r requirements.txt
python run.py --open
```

On Windows you can also double-click **`start.bat`**. It opens at http://127.0.0.1:8770.

Keyboard: press `/` to search, `Esc` to close the side panel or an explanation.

## Android app

`android/` builds a phone app that runs the same Python server **on the phone itself** (Chaquopy embeds Python 3.10). It shows the pages in a full-screen view, so it needs no PC and no shared Wi-Fi. The build copies `app/` and `static/` in fresh each time, so there is still only one copy of the code to edit.

```
cd android
gradlew assembleDebug          # needs Android Studio's JDK (set JAVA_HOME to its jbr folder)
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Links to articles and filings open in the phone's browser. Back closes the details panel first. The phone app has no Anthropic SDK, so questions to Claude are off there; **Meaning** still works. CSV downloads don't work inside the app yet.

## Company page

| Tab | What it answers | Source |
|---|---|---|
| **Overview** | Health check (8 fixed pass / watch / fail rules), trend score (did the latest year beat the one before?), your own notes, key ratios, sales and profit trend, latest quarters, exchange filings, annual reports, earnings calls, credit ratings | Screener.in |
| **Chart & valuation** | Candle / line chart first (1 day to all years, averages, volume, RSI, Nifty, dividends); then quality, valuation and momentum scores out of 100; RSI, 52-week range, biggest fall, volatility, delivery %; returns against the Nifty 50; P/E against its own 5-year median; fair-value calculator; 10 years of dividends and share splits | Yahoo Finance + Screener.in |
| **Financials** | Every year of profit and loss, balance sheet, cash flow, ratios and quarters, with a trend line per row and CSV download | Screener.in |
| **Network** | One map: company → owners → related parties → directors → the other companies those directors run, plus peers | Screener.in + ZaubaCorp |
| **People** | Every director and key manager: role, tenure, how many boards they sit on, which other companies, and shared boards | ZaubaCorp (Ministry of Corporate Affairs records) |
| **Owners & dealings** | Promoter / FII / DII / public trend, named shareholders with 1-year change, related parties the company transacts with, peers | Screener.in |
| **News** | Last 12 months of headlines for the company, its key people and main promoters, plus a 3-year risk-scan search, each auto-tagged and marked likely positive / negative for the share price (filterable; hover a badge for the words that decided it) | Google News RSS |
| **Risks** | Rule-based checks on debt, cash, ownership, margins, valuation, related parties, directors and news, each with its evidence | All of the above |

Small **i** buttons next to technical terms open a plain-English meaning.

## Ask Claude

Select any text on a page and a small bar appears: **Meaning** explains the term, and the box lets you type a question about it. Answers show in the **Ask Claude** chat panel at the bottom left, which you can collapse to a button and reopen. Claude is told which company and tab you are on and its key numbers, so you can ask things like "is this debt level high for this company?".

- **Meaning** works without any setup for the ~90 terms in the built-in glossary.
- **Questions to Claude** need an Anthropic API key (a paid Anthropic account). Put the key as the only text in a file named `anthropic-key.txt` in this folder, or set the `ANTHROPIC_API_KEY` environment variable, then restart Stock Lens. The file is git-ignored and the key stays on the server; the browser never sees it.
- It uses `claude-opus-5-5` at low effort. Set `STOCK_LENS_MODEL` to use a different model. Every question is a paid API call.
- Your chat is saved in this browser only. **New chat** (pencil icon) clears it.

## Tools

| Page | What it does |
|---|---|
| **Home** | **Market news**: the last two days of India and world headlines (markets, RBI and economy, foreign money and rupee, oil, global markets, trade and conflict) split into **Positive / Negative / Unclear for Indian stocks**, each with the reason and which sectors feel it most. A search box (with company suggestions) finds the last year of news for any stock or topic, marked likely positive or negative; **pin** a stock to keep it as a tab next to Market |
| **Watchlist** | The companies you follow with the live price and today's change (Yahoo Finance, refreshed every minute while open). Tap a stock to open it. **Price targets** (in Edit): you get a notification when the price reaches one (PC: while Stock Lens is open in the browser; phone app: also when the app is closed, checked about every 15 minutes) |
| **Markets** | **Sectors**: 13 NSE sector indices ranked by their move today, this week or this month; tap one to see its stocks (NSE's official index list) with live price and today's change, best first. **Commodities**: gold and silver (rough ₹ price before duty and GST), Brent and WTI crude, natural gas, copper, and the dollar in rupees. **F&O**: India VIX with a calm-to-fearful scale (option chain and open interest are NSE-only and blocked for free tools; the tab links to NSE's page). Each company page also shows today's move for the stock, its sector and the Nifty 50 |
| **Screener** | **Screen stocks**: your own rules (12 filters, 6 presets) over the Nifty 50, 100, 200 or 500, sortable, with CSV download. **Compare**: up to 4 companies side by side on every health check, the trend score and price returns |
| **Portfolio** | Enter holdings to see gain or loss, the split by industry, and warning signs on concentration and business health, with CSV download |

## How the scores work

All scores are simple, visible rules. They count facts; they do not predict prices.

- **Health check** and **trend score** — `static/score.js`. The trend score follows the Piotroski F-score, using 8 of its 9 questions (the free data has no current ratio).
- **Quality, valuation and momentum scores** and the **fair-value calculator** — `static/pro.js`.
- **Risk checks** — `static/risk.js`.

Thresholds are plain numbers in those files, so you can change them.

## Good to know

- **Free data only.** Results are cached in `cache/` (fundamentals 12 h, directors 3 days, news and prices 1 h, index lists 7 days). Delete the folder to force fresh data.
- **Your data stays in your browser.** Watchlist, portfolio, notes, compare list and screener rules are saved in the browser's local storage. Nothing is sent anywhere, and clearing browser data removes them.
- **First load of a company takes about 10–20 s** because director records are fetched politely one by one. The first Nifty 500 screen takes a few minutes for the same reason.
- **Prices are delayed**, and returns leave out dividends.
- **News flags are keyword hints, not verdicts.** "US court drops bribery case" still gets flagged as bribery. Read the story.
- **Not available from free sources:** analyst forecasts and target prices, bulk / block / insider deals, promoter pledges, related-party rupee amounts, customer and supplier names, court cases. The Risks tab lists where to look.
- If a source changes its page layout, the matching part may break; the rest keeps working.

## Layout

```
run.py            start the local server
app/              Python: server, Screener, ZaubaCorp, news, cache
static/           the web page: app.js (core), pro.js (tools), score.js, risk.js,
                  glossary.js ("i" explanations), charts.js, app.css
```
