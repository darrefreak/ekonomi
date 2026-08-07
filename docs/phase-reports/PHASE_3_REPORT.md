# Phase 3 Report — Core product

**Date:** 2026-08-07  
**Status:** COMPLETE — STOPPED (awaiting `START PHASE 4`)  
**Branch:** `cursor/phase-3-core-product-9c58`

## 1. Completed items

### Financial engine

- `cashflow.ts`: monthly aggregation helpers, period comparison (`spendingDeltaPercent`)
- `coverage.ts`: overall coverage percent from area statuses
- Unit tests for both

### API

- Shared `HouseholdMetricsService` for account rows, monthly totals, cashflow, coverage/freshness
- `GET /api/v1/cashflow?householdId=`
- `GET /api/v1/net-worth?householdId=`
- `GET /api/v1/coverage?householdId=` (Nest module: `financial-coverage` — avoids `.gitignore` `coverage/`)
- `GET /api/v1/review?householdId=`
- Account detail: recent transactions + balance history
- Transactions: `q`, date, account, category filters
- Dashboard enriched with `cashflowPoints` (last 6), `coverageAreas`, `coveragePercent`, `reviewCount`, freshness

### Schemas / api-client

- Zod schemas: cashflow, net-worth, coverage, review; extended dashboard/accounts/transactions
- Client methods for new endpoints + filters

### Web

- Richer dashboard: mini cashflow chart, coverage list, review count
- Account detail page
- Transactions filter UI
- Cashflow, net worth, review pages
- `ensureHouseholdSession()` for demo household wiring

## 2. Architecture decisions

1. Period comparison uses deterministic engine helpers; API only loads events and maps money JSON.
2. When `DEMO_AS_OF_DATE` is the 1st of an empty month, “current” display month falls back to the previous non-empty month (July for Aug 1 demo).
3. Nest coverage HTTP module lives under `apps/api/src/financial-coverage/` so it is not ignored by test-coverage gitignore patterns.
4. Dashboard mini-chart uses 6 months; full cashflow endpoint returns 12.

## 3. Tests

| Suite | Status |
|---|---|
| Cashflow / coverage engine tests | ✅ |
| Ledger / net worth tests | ✅ |
| `pnpm test` | ✅ |

## 4. Build / lint / typecheck / migrations / Docker

| Check | Status |
|---|---|
| `pnpm build` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| Migrations (Phase 2 schema, no new migration) | ✅ |
| Docker infra (postgres/redis/minio/mailpit) | ✅ |
| API smoke (dashboard/accounts/tx/cashflow/net-worth/coverage/review) | ✅ |
| Web smoke (`/`, `/accounts`, `/accounts/:id`, `/transactions`, `/cashflow`, `/net-worth`, `/review`) | ✅ HTTP 200 |
| Demo login → coverage ~72%, reviewCount 13, Netflix filter hits | ✅ |

## 5. Known limitations

- July vs June spending delta ≈ **197%** is correct for seeded vacation month, not a chart bug.
- Some investment accounts may show empty recent source-tx lists (events exist on cash side).
- Net worth history points are snapshot-based (sparse), not daily reconstructed.
- Review queue is read-only foundation (no resolve/actions yet).
- Lint scripts remain stubs outside Next build-time checks.

## 6. Intentionally deferred

- Budget / subscriptions / contracts / sinking funds / goals (Phase 4)
- Vehicle foundation (Phase 4B)
- Forecast / opportunities / AI

## 7. Suggested next phase

Await: **`START PHASE 4`**

## 8. STOP

Phase 3 complete. **Phase 4 not started.**
