# Batch C2 — Metric Registry Report

**Status:** COMPLETE  
**Branch:** `cursor/batch-c2-metric-registry-9c58`  
**Base:** `cursor/batch-s1-runtime-validation-9c58`  
**Date:** 2026-08-07

---

## Fixed acceptance issues

| Issue | Result |
|---|---|
| P0-8 Metric Registry | **FIXED** — versioned definitions, shared compute, snapshots, consumer checklist |

---

## Architecture

```
@ffos/financial-engine METRIC_DEFINITIONS (code-first)
        ↓
MetricRegistryService.ensureDefinitions() → metric_definitions
MetricRegistryService.materializeSnapshots() → metric_snapshots
        ↓
HouseholdMetricsService.getFinancialSnapshot() (+ metricMeta)
        ↓
dashboard / net-worth / debt / wealth / reports / AI tools
```

- Formulas remain in `@ffos/financial-engine`
- `positionFromAccounts` uses `bucketBalancesForNetWorth` (single bucketing path)
- Ledger-aligned balances for debt/wealth totals
- Snapshots are rebuildable — ledger remains SoT

---

## Registry surface

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/metrics/definitions` | Catalog + `bundleVersion` |
| `GET /api/v1/metrics/snapshots?householdId&asOf` | Materialize + return core snapshots |
| `GET /api/v1/metrics/meta?householdId` | Lightweight meta |

Core metric keys: `net_worth`, `available_cash`, `investments_total`, `assets_total`, `debt_total`, `income_period`, `spending_period`, `savings_period`, `net_savings_rate`, `cash_runway_months`, `financial_coverage_percent`.

Bundle version: `1.0.0`

---

## Consumer checklist

| Surface | Consumes shared path | Notes |
|---|---|---|
| Dashboard | `getFinancialSnapshot` + `metricMeta` | NW/cash/debt/savings/rate/runway |
| Net worth | same | + history snapshots |
| Cashflow | `metrics.cashflow` | period series |
| Coverage | `metrics.coverage` | also in registry snapshots |
| Debt totals | ledger-aligned + `snap.position.liabilities` | `debt_total` |
| Wealth investments/assets | ledger-aligned + snap position | registry totals |
| Reports | engine `calculateNetSavingsRate` + version tags; NW from snap | period may ≠ current month |
| AI `get_net_worth` | snapshot + bundleVersion/inputHash | read-only |

---

## DB

Migration `0019_batch_c2_metric_registry.sql`:

- `metric_definitions` (key + version unique)
- `metric_snapshots` (household + key + asOf + version unique)

---

## Tests

- Engine: `metric-registry.test.ts`
- API: `metric-registry.consistency.test.ts` — demo household dashboard/NW/debt/wealth/registry agree

---

## Remaining limitations

- Vehicle TCO remains in `VehiclesService` (domain-specific; not duplicated across pages)
- Full `MetricCalculation` run-history table deferred
- Yearly report `inputHash` is period-scoped (`yearly-{year}`), not full household fingerprint

---

## P0 status

| ID | Status |
|---|---|
| P0-8 | **FIXED** |
| P0-5 (S1) | Unchanged FIXED |
| Remaining P0 | See `P0_ISSUES.md` (P0-7 splits product path, etc.) |

---

## Gates

| Gate | Result |
|---|---|
| Build | **PASS** |
| Lint | **PASS** |
| Typecheck | **PASS** |
| Tests | **PASS** (engine + api 56 incl. C2 consistency; A2/A3/S1 green) |
| Docker | **PASS** (`/health/ready`) |

---

## STOP

C2 is complete. Do **not** start the next batch until explicitly instructed.
