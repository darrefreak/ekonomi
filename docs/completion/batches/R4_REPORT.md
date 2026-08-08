# Batch R4 — Metric Registry Integrity (P0-A6)

**Status:** COMPLETE  
**Branch:** `cursor/batch-r4-metric-registry-9c58`  
**PR:** https://github.com/darrefreak/ekonomi/pull/38  
**Base:** `cursor/batch-r3-financial-runtime-9c58`  
**Date:** 2026-08-08  

---

## Ownership

| ID | Result |
|---|---|
| **P0-A6** | **FIXED** |
| R1–R3 P0s | No regressions (api suite 83 pass) |

---

## Root cause → fix

| Gap | Cause | Fix |
|---|---|---|
| Weak `inputHash` | Totals + account count only | Per-account balance lines + posting count/signed sum/max `bookedOn` + max event `updatedAt` |
| `calculationVersion` = bundle | Meta stuffed `METRIC_BUNDLE_VERSION` | `metricCatalogCalculationVersion()` + `metricVersions` map |
| Hardcoded asOf | Product APIs ignored query | `householdAsOfQuerySchema` + `resolveAsOf` on dashboard/NW/debt/wealth/meta/reports |
| Yearly fake hash | `inputHash: yearly-${y}` | `metricInputHash` over year months’ income/spend |
| No historical serve | `getSnapshots` always rematerialized | `getStoredSnapshots` + `mode=stored` query |

---

## Proof tests

| Test | Asserts |
|---|---|
| R4-T1 | Hash changes on internal transfer with unchanged cash/NW totals |
| R4-T2 | `calculationVersion !== bundleVersion`; `metricVersions.net_worth` set |
| R4-T3 | Net-worth honors query `asOf` |
| R4-T4 | Yearly hash is `fnv1a_*`, not `yearly-*` |
| R4-T5 | Stored serve returns persisted row for `(metricKey, calculationVersion, asOf)` |

---

## Gates

| Gate | Result |
|---|---|
| `pnpm build` (engine/schemas/api) | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm --filter @ffos/api test` | PASS (83) |
| `pnpm --filter @ffos/financial-engine test` | PASS (55) |
| Docker `/health/ready` | PASS (`postgres`/`redis` ok; stack up) |

---

## Acceptance stop

| Field | Value |
|---|---|
| P0-A6 | **PASS** |
| inputHash | composition-sensitive |
| calculationVersion | catalog fingerprint ≠ bundle |
| asOf | honored on product APIs |
| historical serve | `mode=stored` |
| yearly hash | derived (`fnv1a_*`) |
| Regressions | none (api 83 / engine 55) |
| P0 remaining | **0** (A1–A8 fixed across R1–R4) |
| FINANCIAL CORE ACCEPTED | **YES** |

Do not start P1 in this batch. Stop and wait for instruction.
