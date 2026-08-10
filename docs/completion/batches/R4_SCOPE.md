# R4 Scope — Metric Registry Integrity (P0-A6)

**Date:** 2026-08-08  
**Branch:** `cursor/batch-r4-metric-registry-9c58`  
**Base:** `cursor/batch-r3-financial-runtime-9c58`

---

## R4 owns

| ID | Classification | In R4? |
|---|---|---|
| **P0-A6** | METRIC_REGISTRY_SEMANTICS | **YES** |
| P0-A1…A5, A7, A8 | — | Already FIXED (R1–R3) — regressions only |

No P1 work in this batch.

---

## P0-A6 — Metric registry integrity

| Field | Value |
|---|---|
| Original finding | Weak `inputHash`; bundle version stuffed into `metricMeta.calculationVersion`; hardcoded asOf on product APIs; yearly `inputHash: yearly-${y}`; `getSnapshots` always rematerializes under current formulas |
| Proof (current) | `METRIC_REGISTRY_VERIFICATION.md` FAIL rows; `household-metrics.service.ts` hash is totals-only; `reports.service.ts` yearly fabricated hash; dashboard/NW/debt/wealth ignore query `asOf`; `/metrics/meta` ignores `asOf`; registry `getSnapshots` → `materializeSnapshots` only |
| Affected files | `metric-registry.ts` (engine), `household-metrics.service.ts`, `metric-registry.service.ts`, `metrics.controller.ts`, `reports.service.ts`, dashboard/NW/debt/wealth controllers+services, `@ffos/schemas` metric/query schemas |
| Runtime path | Metrics serving / snapshot meta — not ledger write correctness |
| Financial consequence | Reproducibility and versioning claims unreliable; core totals already agree on demo |
| Still reproducible | **YES** (pre-fix) |
| Proposed fix | Strong ledger composition fingerprint in `inputHash`; `calculationVersion` from metric defs (+ `metricVersions` map); accept `asOf` on dashboard/NW/debt/wealth/meta; derive yearly hash from period inputs; stored-snapshot read path without silent recompute |
| Dependencies | R1–R3 (none blocking) |
| Classification | **METRIC_REGISTRY_SEMANTICS** |

---

## Explicit non-goals

- P1/P2/P3 product expansion
- Claiming FINANCIAL CORE ACCEPTED until all P0 gates green after R4 verification
- Changing ledger write paths (unless regression)
