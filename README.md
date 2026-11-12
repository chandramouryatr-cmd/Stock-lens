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

## Company page

| Tab | What it answers | Source |
|---|---|---|
| **Overview** | Health check (8 fixed pass / watch / fail rules), trend score (did the latest year beat the one before?), your own notes, key ratios, sales and profit trend, latest quarters, exchange filings, annual reports, earnings calls, credit ratings | Screener.in |
| **Price & valuation** | Quality, valuation and momentum scores out of 100; 5-year price chart with 50-day and 200-day averages; RSI, 52-week range, biggest fall, volatility, delivery %; returns against the Nifty 50; P/E against its own 5-year median; fair-value calculator; 10 years of dividends and share splits | Yahoo Finance + Screener.in |
| **Financials** | Every year of profit and loss, balance sheet, cash flow, ratios and quarters, with a trend line per row and CSV download | Screener.in |
| **Network** | One map: company → owners → related parties → directors → the other companies those directors run, plus peers | Screener.in + ZaubaCorp |
| **People** | Every director and key manager: role, tenure, how many boards they sit on, which other companies, and shared boards | ZaubaCorp (Ministry of Corporate Affairs records) |
| **Owners & dealings** | Promoter / FII / DII / public trend, named shareholders with 1-year change, related parties the company transacts with, peers | Screener.in |
| **News** | Last 12 months of headlines for the company, its key people and main promoters, plus a 3-year risk-scan search, each auto-tagged | Google News RSS |
| **Risks** | Rule-based checks on debt, cash, ownership, margins, valuation, related parties, directors and news, each with its evidence | All of the above |

Small **i** buttons next to technical terms open a plain-English meaning.

## Tools

| Page | What it does |
|---|---|
| **Home** | Health-check screen of 40 large NSE companies, your watchlist and recently opened companies, and "since you last checked" changes on the watchlist (price moves of 3% or more, new results, new filings, health-check changes) |
| **Screener** | Your own rules (12 filters, 6 presets) over the Nifty 50, 100, 200 or 500, sortable, with CSV download |
| **Portfolio** | Enter holdings to see gain or loss, the split by industry, and warning signs on concentration and business health, with CSV download |
| **Compare** | Up to 4 companies side by side on every health check, the trend score and price returns |

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
