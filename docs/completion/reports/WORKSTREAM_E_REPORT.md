# Workstream E Report — Forecast & Scenarios

**Date:** 2026-08-07  
**Branch:** `cursor/workstream-e-forecast-scenarios-9c58`  
**Status:** COMPLETE for scoped E goals

---

## Completed requirements

1. **Horizons 7d–12m deterministic (live)**
   - `GET /api/v1/forecast` recomputes via `buildForecastPoints` from live cash / NW / monthly savings
   - Horizons: 7d, 30d, 60d, 90d, 6m, 12m (`FORECAST_HORIZONS`)
   - Persists `forecast_runs` + `forecast_points` for audit (does not replace live compute)
   - Response includes `source: live-engine` + baseline snapshot

2. **Scenario engine non-destructive**
   - Pure `simulateScenario` in `@ffos/financial-engine`
   - `POST /api/v1/scenarios` create
   - `POST /api/v1/scenarios/:id/simulate` → projected points + monthly delta
   - Response always `ledgerMutated: false`; tests assert account balances unchanged
   - Assumptions: `monthlyIncomeDeltaMinor`, `monthlyExpenseDeltaMinor`, `oneTimeCashDeltaMinor`

3. **Backtesting infra**
   - Engine `backtestLinearForecast`
   - Tables: `forecast_actual_comparisons`, `forecast_accuracy_metrics`
   - `GET /api/v1/forecast/backtest` computes + persists comparisons/metrics
   - Forecast UI “Kör backtest”

4. **UI**
   - Forecast: baseline, all horizons, NW+cash, backtest, optimizer, empty/error
   - Scenarios: create, simulate, show result points, empty/error

5. **Tests**
   - Engine: horizons, simulate purity, backtest matured points
   - API: live forecast labels + simulate does not mutate ledger

---

## Remaining / deferred

- Recurring/bill-level cashflow forecast (still linear monthly/30 model)
- Historical balance-history backtests (current: synthetic lookback)
- Richer assumption types (rate bps → interest engine) beyond monthly deltas
- Auto-prune old forecast runs

---

## Schema / API / UI

| Area | Change |
|---|---|
| Engine | `scenarios.ts`, `backtest.ts`, export `FORECAST_HORIZONS` |
| Migration | `0010_workstream_e_forecast.sql` |
| API | Live forecast, backtest GET, scenario create/simulate |
| UI | Forecast + scenarios pages |
| Client | Matching typed methods |

---

## Gate results

| Gate | Result |
|---|---|
| `pnpm build` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ |
| `pnpm lint` | ✅ (echo stubs — known) |
| `pnpm db:migrate` | ✅ |

---

## Known issues

- Each forecast GET inserts a new run (audit-friendly; may grow — prune later).
- Seeded scenarios now include engine-readable assumption keys; legacy narrative keys kept for display context.

---

## STOP

Workstream E complete for its scope.  
Do **not** auto-start F. Await: `START WORKSTREAM F`
