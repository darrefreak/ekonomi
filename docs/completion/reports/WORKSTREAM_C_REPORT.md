# Workstream C Report — Dashboard

**Date:** 2026-08-07  
**Branch:** `cursor/workstream-c-dashboard-9c58`  
**Status:** COMPLETE for scoped C goals

---

## Completed requirements

1. **Aggregated dashboard API**
   - Single `GET /api/v1/dashboard` continues to return position, month metrics, runway, forecast 30/60/90, brief, upcoming, coverage, freshness, cashflow points, review count
   - **Opportunities** added (top 5 by priority from decisions table)
   - `hasAccounts` flag for honest empty-state handling

2. **All widgets driven by financial data**
   - NW / cash / investments / debt from `getFinancialSnapshot()`
   - Month income/spend/savings/rate + budget remaining from snapshot + planning
   - Forecast deltas from `forecastCashflowDeltas` (engine), not hardcoded SEK
   - Upcoming from subscriptions/contracts/salary estimate
   - Brief from cashflow delta + live opportunities + review queue (no “9 800 kr” tip)

3. **Dashboard UI**
   - Forecast 30/60/90 section with link to `/forecast`
   - Opportunities widget with savings/confidence + link to `/opportunities`
   - Empty states: no accounts, no upcoming, no cashflow, no opportunities
   - Links to net-worth, budget, subscriptions, review
   - Existing page-level loading / error / retry retained

4. **Forecast optimizer honesty (adjacent fix)**
   - `DecisionsService.forecast` optimizer inputs from real ACTIVE subscriptions (annualized), mortgage interest annual, and budget overrun — not hardcoded `4_764` / `48_000`

5. **Tests**
   - `buildBrief` unit tests
   - Schema requires forecast + opportunities
   - Engine deltas ≠ old hardcoded constants
   - Live aggregation test when `DATABASE_URL` present

---

## Remaining / deferred

- Full AI-authored brief (Workstream L) — current brief is deterministic from metrics/opportunities
- Live opportunity detectors beyond seed (Workstream I)
- Richer forecast beyond linear cash deltas (Workstream E)
- TanStack Query / optimistic dashboard refresh

---

## Schema / API / UI

| Area | Change |
|---|---|
| Schema | `opportunities[]`, `hasAccounts` on `dashboardResponseSchema` |
| API | `DashboardService` injects `DecisionsService`; `buildBrief` helper |
| Decisions | Optimizer inputs from metrics/planning/subscriptions |
| UI | Forecast + opportunities widgets; empty states; deep links |

---

## Gate results

| Gate | Result |
|---|---|
| `pnpm build` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ (12/12 api tests when DB available) |
| `pnpm lint` | ✅ (echo stubs — known) |
| Mobile / desktop | ✅ dashboard widgets responsive grid; loading/error on page |

---

## Known issues

- Opportunities list is still seeded detectors (honest for V1 mocks); dashboard displays them, does not invent new ones.
- Forecast widget shows **cash deltas** (engine), while `/forecast` page may also show seeded run points — labels clarify linear engine source on dashboard.

---

## STOP

Workstream C complete for its scope.  
Do **not** auto-start D. Await: `START WORKSTREAM D`
