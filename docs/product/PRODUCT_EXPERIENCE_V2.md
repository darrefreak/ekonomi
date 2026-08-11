# Product Experience V2

Product Experience V2 turns the existing Financial Intelligence pipeline into an
application that surfaces **what happened, why, what is likely to happen next,
what needs attention and what can be done about it** — while every insight
keeps a drill-down path to the underlying records.

No financial engine was rebuilt in this workstream. The ledger, money model,
classification, merchant clusters, learned rules, recurring engine,
subscriptions, expected transactions, the OpenAI provider, Financial Brief V2,
the liquidity engine, the savings engine and the financial oracle are all
untouched; V2 is presentation, navigation and a small number of new
deterministic read-model endpoints on top of them.

## Information architecture

Mobile bottom navigation has exactly five tabs:

| Tab | Route | Contents |
| --- | --- | --- |
| Hem | `/` | Dashboard V2 |
| Pengar | `/money` | Hub: transactions, accounts, recurring/subscriptions, cashflow, contracts |
| Planera | `/plan` | Hub: smart budget, financial calendar, forecast, goals, scenarios |
| Insikter | `/insights` | Insights + What Changed, Weekly Review, opportunities, reports, liquidity, savings, risk |
| Mer | `/more` | Everything else (wealth, data, settings…) |

Desktop keeps the full sidebar, grouped in the same conceptual sections
(Start, Pengar, Planera, Insikter, Förmögenhet, AI, Data, Drift).

## Dashboard V2 hierarchy

The home view answers four questions in order:

1. **How are we doing?** — greeting, net worth, cash, investments, debt.
2. **What happened this month?** — income, spent, saved, savings rate, plus the
   Financial Brief's 3–5 ranked findings.
3. **What changed?** — the "Mot normalt" card: per-month spending change against
   the household's own baseline with the top drivers, linking to
   `/what-changed`.
4. **What happens next / do I need to act?** — Upcoming (linked to the
   calendar), available surplus (linked to liquidity and savings), then lower
   priority sections (forecast, opportunities, cashflow, coverage).

## First ten minutes

After a statement import commits, the UI does not drop the user on a dashboard.
`AnalysisExperience` runs the real pipeline (`POST /intelligence/analyse`),
shows honest stage progress (each line flips when the request behind it
resolves — no invented timers), then presents a completion summary with real
numbers: transactions analyzed, percent understood automatically, recurring
streams found, subscriptions identified and how many patterns need the user.
Primary CTA **Slutför analysen** → `/review`; secondary **Gå till översikten**.

## Review V2

Needs Review works at the cluster level (one card per pattern, not per
transaction). V2 adds:

- ordering by absolute financial impact, largest first;
- a numeric countdown ("6 saker kvar" → 5 → …);
- a completion state: *"Klart. Vi kommer ihåg dina val inför framtida
  importer."* shown when the last item in a session resolves.

Actions remain accept / correct / skip, with "Kom ihåg detta för framtiden"
persisting a household learned rule, and corrections applying to the whole
cluster with the count stated before anything happens.

## Actual vs Expected vs Forecast semantics

Nothing is silently mixed. The calendar labels each event **Känd** (a booked
row), **Förväntad** (a detected recurring pattern with an amount band) or
**Uppskattad** (a deterministic estimate such as the salary guess). Smart
Budget shows **Betalt hittills**, **Prognos månadsslut** and the planned frame
as separate columns. Dashboard totals that include projections say so in their
labels.

## Drill-down everywhere

Every aggregated number links to its evidence:

- What Changed driver → category/merchant report → transactions;
- report row → next dimension → `/transactions?categoryId=…&merchantId=…`;
- calendar event → transaction or recurring detail;
- brief finding → its "Varför ser jag detta?" page.

The transaction list accepts `categoryId`, `merchantId`, `accountId`, `from`,
`to` URL parameters and shows active drill filters as removable chips.

## Explainability

Every smart number carries its basis: Smart Budget groups have "Varför detta
belopp?" (median, latest 3 months, seasonal factor, months observed,
contributors), liquidity has "Så räknade vi", the calendar lists its method,
and What Changed states both windows and the normalisation rule.

## Success metrics (conceptual)

- time from first import to a populated dashboard;
- review items per 1 000 transactions, and percent classified without manual work;
- weekly active engagement; insights opened; recommendations acted on;
- smart budget adoption rate; calendar opens per week.

These are documented for future telemetry; no invasive analytics was added.

## Related documents

- [SMART_BUDGET.md](./SMART_BUDGET.md)
- [FINANCIAL_CALENDAR.md](./FINANCIAL_CALENDAR.md)
- [REPORTS_V2.md](./REPORTS_V2.md)
- [CONTEXTUAL_ADVISOR.md](./CONTEXTUAL_ADVISOR.md)
- [UX_ACCEPTANCE_V2.md](./UX_ACCEPTANCE_V2.md)
