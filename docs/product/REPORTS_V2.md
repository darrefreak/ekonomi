# Reports V2

Reports V2 (`/reports`) is one explorer instead of many fixed reports, with the
classic month/year summaries kept below it.

## Explorer

`GET /api/v1/reports/explore` aggregates the ledger by:

- **measure** — `spending` | `income` | `cashflow`;
- **dimension** — `category` | `merchant` | `account` | `month`;
- **window** — `from`/`to` dates (defaults to the last 12 months);
- **filters** — `categoryId`, `merchantId`, `accountId`.

Each row returns the amount, transaction count, share of total and a
`drillHref` — the next step down the evidence path:

- category row → same window, dimension `merchant`, filtered on the category;
- merchant/account row → `/transactions?…` with the matching filters;
- month row → `/transactions?from=…&to=…`.

A monthly series accompanies every result for the bar chart; bars are buttons,
so tap/click shows the value (mobile tooltips work by touch).

## URL-driven state

All explorer state lives in the query string. Drilling is a normal navigation:
the back button retraces the path, links are shareable, and a **saved view**
("Spara vyn") is just a named query string persisted in `localStorage`
(`ffos.reports.savedViews`). Example saved views: "Mat senaste 12 mån",
"Bilens kostnader", "Fasta kostnader".

## Filtering rules

- Filters render as removable chips.
- The transaction list accepts the same parameters (`categoryId`,
  `merchantId`, `accountId`, `direction`, `minAmountMinor`, `maxAmountMinor`,
  `from`, `to`), so the last drill step needs no special casing.
- Transfers and excluded transactions follow the same rules as the rest of the
  ledger read models: internal transfers never inflate spending or income.

## Classic summaries

Monthly (income, spending, savings, savings rate, top categories) and yearly
summaries remain unchanged below the explorer, with a month picker.
