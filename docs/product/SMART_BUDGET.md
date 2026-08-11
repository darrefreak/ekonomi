# Smart Budget

Smart Budget is the default budgeting experience. It replaces "budget fifty
categories" with **six conceptual groups**, each with a deterministic suggested
amount computed from the household's own history. The old category-level budget
remains available as **Detaljerad budget** on the same page — smart defaults
first, power second.

## Groups

| Key | Name | What goes in |
| --- | --- | --- |
| `essential_fixed` | Boende & fasta kostnader | Recurring streams classified as essential with a fixed cadence (mortgage, rent, insurance, utilities contracts) |
| `essential_variable` | Mat & vardag | Essential variable spending baselines (groceries, fuel, household) |
| `irregular` | Ojämna kostnader | Sinking funds and annual/seasonal obligations normalised to a monthly reservation |
| `flexible` | Flexibelt | Discretionary spending baseline |
| `goals` | Mål | Active savings goals' monthly plans |
| `savings` | Planerat sparande | The recommended savings allocation from the savings engine |

## Suggestion engine

`GET /api/v1/smart-budget?householdId=…&month=YYYY-MM` returns per group:

- `suggestedMinor` — deterministic recommendation;
- `basis` — 12–24-month median, latest-3-month average, seasonal factor for the
  target month, months observed and formatted notes;
- `contributors` — the largest underlying rows (recurring streams, categories,
  goals, funds) with drill-down links;
- `actualMinor` and `forecastMinor` — spent so far in the month and the
  deterministic month-end projection (actual + remaining expectation).

All arithmetic is BigInt minor units; no LLM is involved in any number. The
"Varför detta belopp?" disclosure renders the basis verbatim.

## Flex number

`flex` is **"Kvar att använda"**: expected income minus essential fixed,
essential variable, irregular reservations, goals and the savings plan. It is
explicitly *not* the account balance, and the UI says so. For an in-progress
month `remainingMinor` = planned flexible frame − flexible spend so far.

## Adoption

`POST /api/v1/smart-budget` with `{ householdId, month, lines: [{key,
plannedMinor}] }` stores the household's chosen plan in the `smart_budgets`
table (one row per household+month, upsert). The suggestion is always
recomputed from history; adoption only fixes the *planned* amounts. Adopting
requires explicit user action ("Anta förslaget") — nothing is budgeted
automatically.

## Month-end forecast

Each group card shows Budget (planned or suggested), Betalt hittills, Prognos
månadsslut and Trolig avvikelse, so "likely over by 1 450 kr" is visible before
the month ends.
