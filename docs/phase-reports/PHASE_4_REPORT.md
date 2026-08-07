# Phase 4 Report — Planning foundation

**Date:** 2026-08-07  
**Status:** COMPLETE — STOPPED (awaiting `START PHASE 4B` or `START PHASE 5`)  
**Branch:** `cursor/phase-4-planning-foundation-9c58`  
**Base:** `cursor/phase-3-core-product-9c58` (main has not merged prior phases yet)

## 1. Completed items

### Database / migrations

- Migration `0002_phase4_planning.sql`
- Tables: `budget_periods`, `budget_lines`, `recurring_items`, `subscriptions`, `contracts`, `sinking_funds`, `goals`
- Drizzle schema: `apps/api/src/db/schema-planning.ts`

### Financial engine

- Deterministic helpers in `planning.ts`:
  - budget remaining / variance / utilization
  - category spend rollup into parent budget keys
  - goal progress + required monthly contribution
  - subscription annualization
- Unit tests for all of the above

### Seed

- Budget periods for recent months with Housing/Food/Transport/Family/Lifestyle lines
- Subscriptions: Netflix, Spotify Family, iCloud+
- Recurring: salary, Netflix, electricity (detected)
- Contracts: Trygg-Hansa, Vattenfall, SBAB mortgage
- Sinking funds: semester, bilunderhåll
- Goals: emergency fund, travel, extra amortization

### API

- `GET /api/v1/budget`
- `GET /api/v1/subscriptions` (includes recurring patterns)
- `GET /api/v1/contracts`
- `GET /api/v1/goals` (includes sinking funds)
- Dashboard `thisMonth.budgetRemaining` now from real budget totals

### Web

- Replaced placeholders: `/budget`, `/subscriptions`, `/contracts`, `/goals`
- Dashboard shows “Budget kvar”

## 2. Architecture decisions

1. Planning tables live in `schema-planning.ts` (separate from economic core).
2. Actuals for budget lines roll up leaf categories (`food.groceries` → `food`) via engine helper.
3. Empty as-of month (e.g. Aug 1) falls back to previous month for budget display, matching cashflow.
4. Branch stacked on Phase 3 tip because Phase 0–3 PRs are still open drafts on `main`.

## 3. Tests

| Suite | Status |
|---|---|
| Planning engine tests | ✅ |
| Existing ledger/cashflow/coverage | ✅ |
| `pnpm test` | ✅ |

## 4. Build / lint / typecheck / migrations / Docker

| Check | Status |
|---|---|
| `pnpm build` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm db:migrate` | ✅ (`0002_phase4_planning`) |
| `pnpm db:seed` | ✅ (311 events + planning data) |
| API smoke budget/subs/contracts/goals | ✅ |
| Web smoke `/budget` `/subscriptions` `/contracts` `/goals` | ✅ HTTP 200 |

## 5. Known limitations

- Planning APIs are read-focused (no create/update/delete UI yet).
- Budget lines are top-level groups only (not full detailed category tree).
- Recurring detection is seeded, not algorithmically discovered from history.
- Subscription write/cancel flows deferred.

## 6. Intentionally deferred

- Phase 4B vehicle foundation
- Forecast / scenarios / opportunities (Phase 5)
- Real connectors / OCR (Phase 6)
- AI advisor (Phase 7)

## 7. Suggested next phase

Await: **`START PHASE 4B`** (vehicles) or **`START PHASE 5`** (decision engines)

## 8. STOP

Phase 4 complete. **Next phase not started.**
