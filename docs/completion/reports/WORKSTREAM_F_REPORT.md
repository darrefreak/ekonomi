# Workstream F Report — Debt & Mortgages

**Date:** 2026-08-07  
**Branch:** `cursor/workstream-f-debt-mortgages-9c58`  
**Status:** COMPLETE for scoped F goals

---

## Completed requirements

1. **Replaced `/debt` placeholder**
   - Real `DebtPage` with totals, liability list, detail (principal vs interest, history)
   - Dashboard “Skuld” links to `/debt`

2. **Principal vs interest**
   - From ledger: events with `memo=principal` postings → `debtReductionMinor` / `expenseAmountMinor`
   - Trailing 12 months per liability + household totals
   - Payment history on debt detail

3. **Rate scenarios**
   - Engine: `monthlyInterestFromRateMinor`, `mortgageRateScenarioMonthlyDeltaMinor`
   - Debt API embeds +50/+100/+200 bps shocks for mortgages with known rate
   - Scenario engine honors `mortgageRateDeltaBps` with live mortgage context (non-destructive)

4. **Debt API**
   - `GET /api/v1/debt?householdId=`
   - `GET /api/v1/debt/:accountId?householdId=`
   - Schemas + api-client

5. **Account mortgage metadata**
   - Migration `0011_workstream_f_debt.sql`: `interest_rate_bps`, `binding_end_date`
   - Backfill demo mortgage/loan rates; normalize Billån sign to positive liability

---

## Remaining / deferred

- Full amortization schedule calculator
- LTV / debt-ratio widgets
- Credit-card APR / min-payment product depth
- Inline rate edit UI (metadata seeded/backfilled)

---

## Schema / API / UI

| Area | Change |
|---|---|
| Engine | `debt.ts` + scenario rate shock |
| Migration | `0011_workstream_f_debt.sql` |
| API | `DebtModule` list/detail |
| UI | `/debt` real page |
| Client | `getDebt` / `getDebtDetail` |

---

## Gate results

| Gate | Result |
|---|---|
| `pnpm build` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ (debt + engine debt tests) |
| `pnpm lint` | ✅ (echo stubs — known) |
| `pnpm db:migrate` | ✅ |

---

## Known issues

- Rate fallback from trailing interest is approximate when `interest_rate_bps` unset.
- Credit cards may have zero principal/interest splits (honest empty history).

---

## STOP

Workstream F complete for its scope.  
Do **not** auto-start G. Await: `START WORKSTREAM G`
