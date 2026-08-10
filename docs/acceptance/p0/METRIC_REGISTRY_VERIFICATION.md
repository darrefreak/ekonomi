# Metric Registry Verification

**Date:** 2026-08-08 (R4 re-verify)  
**Catalog:** `packages/financial-engine/src/metric-registry.ts`  
**Serving:** `apps/api/src/metrics/metric-registry.service.ts`

---

## Definition integrity

| Check | Result |
|---|---|
| Unique `metricKey` | PASS — 11 keys; unit test enforces uniqueness |
| Explicit formula description | PASS |
| Per-metric `calculationVersion` | PASS in catalog (`1.0.0`) |
| Deterministic engine implementation | PASS for money position via `bucketBalancesForNetWorth` + `calculateNetWorth` |
| Bundle version | PASS — `METRIC_BUNDLE_VERSION = "1.0.0"` |
| Consistent units | PASS — money_minor / ratio_percent / months |
| No duplicate competing catalog entries | PASS |

Registered keys: `net_worth`, `available_cash`, `investments_total`, `assets_total`, `debt_total`, `income_period`, `spending_period`, `savings_period`, `net_savings_rate`, `cash_runway_months`, `financial_coverage_percent`.

---

## inputHash

| Check | Result |
|---|---|
| Non-constant | PASS |
| Changes when position totals change | PASS |
| Sensitive to composition with same totals | **PASS (R4)** — per-account balance lines + posting count/sum/max bookedOn + max event updatedAt |
| Yearly report hash | **PASS (R4)** — derived from period month income/spend via `metricInputHash` |
| `metricMeta.calculationVersion` | **PASS (R4)** — catalog fingerprint (`metricCatalogCalculationVersion`); `metricVersions` map exposed; not bundle semver |

Verdict: inputHash is a **composition-sensitive reproducibility fingerprint** acceptable for P0-8.

---

## Versioning / historical snapshots

| Check | Result |
|---|---|
| DB unique `(householdId, metricKey, asOf, calculationVersion)` | PASS |
| Serving historical formula for old version | **PASS (R4)** — `GET /metrics/snapshots?mode=stored` (+ optional metricKey/calculationVersion) reads DB without rematerialize |
| Silent rewrite of meaning | Mitigated by version column on write **and** stored read path |

---

## Cross-surface consistency (demo household)

Verified by `metric-registry.consistency.test.ts` (PASS):

| Surface | net_worth | debt_total | investments_total | assets_total |
|---|---|---|---|---|
| Registry snapshot | ✓ | ✓ | ✓ | ✓ |
| Net worth API | ✓ | via breakdown | ✓ | ✓ |
| Debt list totals | — | ✓ | — | — |
| Wealth APIs | — | — | ✓ | ✓ |
| AI `get_net_worth` | same snap path | same | same | — |

---

## asOf coherence

**PASS (R4):** dashboard, net-worth, debt, wealth, metrics meta, and reports accept optional `asOf` (query → `DEMO_AS_OF_DATE` → default). Metrics snapshots already accepted `asOf`.

---

## Snapshot invalidation

| Store | Behavior |
|---|---|
| `metric_snapshots` | Live rematerialize on default read; stored mode serves persisted rows |
| `account_balance_snapshots` (NW history) | Invalidate + upsert (R2) |

---

## Registry acceptance

**PASS** for P0-8 / P0-A6 after R4.
