# Workstream G Report — Wealth & Investments

**Date:** 2026-08-07  
**Branch:** `cursor/workstream-g-wealth-investments-9c58`  
**Status:** COMPLETE for scoped G goals (gates pending in this revision)

---

## Completed requirements

1. **Replaced `/investments` and `/assets` placeholders**
   - Real `InvestmentsPage` / `AssetsPage` with totals, lists, empty/error states
   - Dashboard “Investeringar” links to `/investments`
   - Net-worth breakdown links to investments, assets, debt

2. **NW history from snapshots**
   - `ensureNetWorthHistorySnapshots()` reconstructs month-end balances from ledger and persists `account_balance_snapshots` (`source: nw_history_reconstruct`) when sparse
   - `netWorthHistoryFromSnapshots()` composes household NW per snapshot date
   - Net-worth UI renders history bars + list (no fabricated prior = current − change)

3. **Attribution real**
   - Continues engine-driven attribution from shared `getFinancialSnapshot()` (Workstream A)
   - No hardcoded NW change/attribution on wealth surfaces

4. **Wealth API**
   - `GET /api/v1/investments?householdId=`
   - `GET /api/v1/assets?householdId=`
   - Schemas + api-client `getInvestments` / `getAssets`

5. **Engine helpers**
   - `bucketBalancesForNetWorth`, `netWorthFromTypedBalances`, `monthEndDates`

---

## Remaining / deferred

- Mark-to-market / holdings-level investment performance
- Housing valuation depth beyond ASSET account balances
- Dedicated valuation snapshot product UI beyond vehicle ranges

---

## Schema / API / UI

| Area | Change |
|---|---|
| Engine | `wealth.ts` + tests |
| API | `WealthModule` investments/assets; NW history via metrics |
| UI | `/investments`, `/assets`, NW history; dashboard link |
| Client | `getInvestments` / `getAssets` |

---

## Gate results

| Gate | Result |
|---|---|
| `pnpm build` | pending |
| `pnpm typecheck` | pending |
| `pnpm test` | pending |
| `pnpm lint` | pending |

---

## STOP

Workstream G complete for its scope once gates pass.  
Do **not** auto-start H. Await: `START WORKSTREAM H`
