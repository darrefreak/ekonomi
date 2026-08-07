# Metric Registry Verification

**Date:** 2026-08-07  
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
| Non-constant | PASS — derived from household, asOf, bundle, account count, position totals, income/spend, month |
| Changes when position totals change | PASS (by construction) |
| Sensitive to composition with same totals | **FAIL** — account IDs / per-account balances / posting counts omitted |
| Yearly report hash | **FAIL** — `inputHash: yearly-${y}` fabricated (`reports.service.ts`) |
| `metricMeta.calculationVersion` | **FAIL** vs catalog — set to **bundle** version, not per-metric version |

Verdict: inputHash is **meaningful but weak** — not acceptable as a reproducibility fingerprint for acceptance.

---

## Versioning / historical snapshots

| Check | Result |
|---|---|
| DB unique `(householdId, metricKey, asOf, calculationVersion)` | PASS — can store old versions |
| Serving historical formula for old version | **FAIL** — `getSnapshots` always rematerializes with **current** defs |
| Silent rewrite of meaning | Mitigated by version column on write; **not** by read path |

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

Residuals: debt **detail** uses cache; reports monthly can attach snap meta while computing a different period’s savings rate.

---

## asOf coherence

Most product APIs hardcode `process.env.DEMO_AS_OF_DATE ?? "2026-08-01"` and do not accept client `asOf`. Metrics snapshots accept `asOf`; `/metrics/meta` ignores it. Mixed period (reports) vs position asOf is possible without dual timestamps in meta.

---

## Snapshot invalidation

| Store | Behavior |
|---|---|
| `metric_snapshots` | Rematerialized on read — live ledger wins |
| `account_balance_snapshots` (NW history) | Insert-if-missing only — **stale history can survive mutations** |

---

## Registry acceptance

**FAIL** as fully closed P0-8. Catalog + shared consumers exist; hash/version/asOf/history gaps remain.
