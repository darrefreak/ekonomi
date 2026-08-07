# Workstream D Report — Budget & Planning

**Date:** 2026-08-07  
**Branch:** `cursor/workstream-d-budget-planning-9c58`  
**Status:** COMPLETE for scoped D goals

---

## Completed requirements

1. **Editable budgets**
   - `PATCH /api/v1/budget/lines/:lineId` updates `plannedMinor`
   - Returns full budget with engine-computed actuals / remaining / utilization
   - Budget UI: inline planned (kr) edit + save per line

2. **Actuals from engine**
   - Unchanged honest path: financial events → `rollupActualByBudgetKey` → `summarizeBudget`
   - Planned is writable DB state; actuals are never hardcoded

3. **Goals contributions**
   - `POST /api/v1/goals` create
   - `PATCH /api/v1/goals/:goalId` update
   - `POST /api/v1/goals/:goalId/contributions` increments `currentMinor` + history row
   - Linked sinking fund (`sinkingFundId`) receives matching reserved bump + fund contribution

4. **Sinking funds UX**
   - `POST/PATCH /api/v1/sinking-funds` and `POST .../contributions`
   - Goals page: create fund, contribute, progress bars, empty states
   - Goal DTO exposes `sinkingFundId`

5. **Schemas / client / migration**
   - Write DTOs in `@ffos/schemas` planning module
   - api-client mutation helpers
   - Migration `0009_workstream_d_planning.sql` — contribution history tables

6. **Tests**
   - Schema tests + DB mutation test for budget line + goal/fund contribute

---

## Remaining / deferred

- Period selector / copy-forward budget period
- Detailed category tree (leaf-level budgets)
- Edit monthly contribution inline on goals (API exists; UI focuses on contribute)
- Subscription/contract write & cancel (out of D DoD)
- Planned expenses entity (scaffold elsewhere)

---

## Schema / API / UI

| Area | Change |
|---|---|
| Migration | `0009_workstream_d_planning.sql` |
| API | Budget line PATCH; goals/sinking-funds CRUD-lite + contributions |
| UI | Editable budget; goals/funds contribute + create |
| Client | Matching typed methods |

---

## Gate results

| Gate | Result |
|---|---|
| `pnpm build` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ (16 api tests incl. planning.mutations) |
| `pnpm lint` | ✅ (echo stubs — known) |
| `pnpm db:migrate` | ✅ |

---

## Known issues

- Contribution history is stored but not yet listed in UI (available for later audit/reports).
- Budget period resolution still uses asOf / spend heuristic (no manual period picker).

---

## STOP

Workstream D complete for its scope.  
Do **not** auto-start E. Await: `START WORKSTREAM E`
