# Batch R3 — Remaining Financial Runtime Correctness

**Status:** COMPLETE (batch scope)  
**Branch:** `cursor/batch-r3-financial-runtime-9c58`  
**Base:** `cursor/batch-r2-money-ledger-truth-9c58`  
**Date:** 2026-08-08  

**Does not claim P0 financial core accepted.**

---

## Remaining P0 mapping

| ID | Classification | R3 ownership |
|---|---|---|
| P0-A4 | PRODUCT_PATH | **Owned + FIXED** |
| P0-A6 | METRIC_REGISTRY_SEMANTICS | **Deferred to R4** |
| P0-A7 | RUNTIME_FINANCIAL_CORRECTNESS | **Owned + FIXED** |
| P0-A8 | RUNTIME_FINANCIAL_CORRECTNESS | **Owned + FIXED** |

See `R3_SCOPE.md`.

---

## Root cause → fix

### P0-A4
**Cause:** Refund/splits lived in service/tests only; no HTTP/client/UI.  
**Fix:** `POST /api/v1/ledger/refunds`, `POST .../events/:id/splits`, api-client methods, transaction-detail refund UI.

### P0-A7
**Cause:** Cash purchase builder unused; no financed builder; seed used vehicle opening.  
**Fix:** `createAssetPurchase` + `buildFinancedAssetPurchase` / `createFinancedAssetPurchase` + HTTP; demo seed posts purchase event (opening 0 + funded cash opening).

### P0-A8
**Cause:** `REVERSED`/`CORRECTED` enum unused; reconstruct/period totals always included all events.  
**Fix:** `financial_events.status` (migration 0021); `reverseFinancialEvent` sets REVERSED; reconstruct + period metrics filter ACTIVE (+ exclude `isExcluded` source txs).

### Related runtime (batch-required)
- Classification revise HTTP: `POST .../events/revise-classification` (EXPENSE→TRANSFER)
- Exclude: period metrics skip excluded primary source txs; ledger balances unchanged
- Valuation vs depreciation: valuation is vehicle metadata; depreciation is sole ledger write-down path
- SEK-only aggregation guard in `positionFromAccounts`
- Period rule: `financial_events.occurredOn`
- Openings: position only, not period income/expense

---

## Product paths verified

| Path | HTTP | Persist | Position |
|---|---|---|---|
| Internal transfer | yes | yes | yes |
| CC purchase/payment | yes | yes | yes |
| Mortgage split | yes | yes | yes |
| Investment transfer | yes | yes | yes |
| Refund | **yes (R3)** | yes | yes |
| Asset purchase (cash) | **yes (R3)** | yes | yes |
| Financed purchase | **yes (R3)** | yes | yes |
| Depreciation | yes | yes | yes |
| Split replace | **yes (R3)** | yes | n/a |
| Classification revise | **yes (R3)** | yes | yes |
| Reverse | **yes (R3)** | yes | yes |

---

## Depreciation

Incremental write-downs (20k then 30k) → cumulative 50k to 250k. Valuation estimate does not auto-post. Idempotency remains R1.

---

## Opening balances

Openings establish position; periodEventTotals ignore them (only events). Mortgage/cash openings do not create income/expense.

---

## Period semantics (V1)

`occurredOn` on financial events (= booking date at create). Metrics filters use that date. SEK-only for position aggregation.

---

## Multi-currency limitations

V1 rejects aggregating mixed currencies in `positionFromAccounts`. No FX engine.

---

## Comprehensive scenario test

`r3-financial-runtime.test.ts` — salary, CC buy/pay, mortgage, invest, depreciation, refund; asserts balances, spending 9 500, income 50 000, debt reduction 10 000, NW coherent.

---

## P0 remaining for R4

| ID | Item |
|---|---|
| **P0-A6** | Metric registry inputHash / asOf / historical version serve |

---

## Gates

| Gate | Result |
|---|---|
| Runtime product paths | **PASS** |
| Depreciation | **PASS** |
| Opening balances | **PASS** |
| Period semantics | **PASS** |
| No-double-counting scenario | **PASS** |
| Ledger truth / money exactness / R1–R2 regressions | **PASS** (suite) |
| Build / Lint / Typecheck / Tests / Docker | *(stop report)* |

**FINANCIAL CORE ACCEPTED: NO** — wait for R4 (metric registry semantics).
