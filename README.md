# Stock Lens

A personal tool for fundamental analysis of Indian listed stocks. Search a company and it shows you:

| Tab | What it answers | Source |
|---|---|---|
| **Overview** | What the company does, key ratios, sales and profit trend, latest quarters, exchange filings, annual reports, earnings calls, credit ratings | Screener.in |
| **Network** | One map: company → owners → related parties → directors → the other companies those directors run, plus peers | Screener.in + ZaubaCorp |
| **People** | Every director and key manager: role, tenure, how many boards they sit on, which other companies, and "shared boards" (companies where 2+ of them sit together) | ZaubaCorp (Ministry of Corporate Affairs records) |
| **Owners & dealings** | Promoter / FII / DII / public trend, named shareholders with 1-year change, related parties the company transacts with, peers | Screener.in |
| **News** | Last 12 months of headlines for the company, its key people and main promoters, plus a 3-year "risk scan" search, each auto-tagged | Google News RSS |
| **Risks** | Rule-based checks (debt, interest cover, cash conversion, promoter selling, institutional selling, margin squeeze, profit drop, valuation vs peers, related-party loans, busy directors, new leadership, flagged news), each with its evidence | All of the above |

## Run it

Double-click **`start.bat`**, or in a terminal:

```
cd stock-lens
python run.py --open
```

It opens at http://127.0.0.1:8770. Keyboard: press `/` to search, `Esc` to close the side panel.

## Good to know

- **Free data only.** Results are cached in `cache/` (fundamentals 12 h, directors 3 days, news 1 h). Delete the folder to force fresh data.
- **First load of a company takes ~10–20 s** because director records are fetched politely one by one. After that it's instant.
- **News flags are keyword hints, not verdicts.** "US court drops bribery case" still gets flagged as bribery. Read the story.
- **Blind spots:** customer/supplier names, promoter pledges, related-party rupee amounts and court cases aren't in this free data. The Risks tab lists where to look.
- If a source changes its page layout, the matching part (Screener / ZaubaCorp / News) may break; the rest keeps working.

For personal research only. Not investment advice.
