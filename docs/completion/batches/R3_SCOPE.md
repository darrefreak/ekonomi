# R3 Scope — Remaining Financial Runtime Correctness

**Date:** 2026-08-08  
**Branch:** `cursor/batch-r3-financial-runtime-9c58`  
**Base:** `cursor/batch-r2-money-ledger-truth-9c58`

---

## R3 owns

| ID | Classification | In R3? |
|---|---|---|
| **P0-A4** | PRODUCT_PATH | **YES** |
| **P0-A7** | RUNTIME_FINANCIAL_CORRECTNESS / PRODUCT_PATH | **YES** |
| **P0-A8** | RUNTIME_FINANCIAL_CORRECTNESS | **YES** |
| **P0-A6** | METRIC_REGISTRY_SEMANTICS | **NO → R4** |

Related runtime gaps fixed under R3 (not separate acceptance IDs, but required by batch):

- Classification revision product path (metadata-only `isInternalTransfer` today)
- Exclude/include metric semantics
- Comprehensive no-double-count scenario
- Valuation vs depreciation rule documentation
- Opening-balance / period / SEK-only guardrail documentation

---

## P0-A4 — P0-7 product path gaps

| Field | Value |
|---|---|
| Original finding | Refund service-only; general category splits schema unused for writes; no api-client/UI for ledger mutations |
| Proof (current) | `LedgerController` has transfer/CC/mortgage/invest/depr — **no** `/refunds` or `/splits`. `createCashRefund` + `replaceSplits` exist on service. `packages/api-client` has zero `/api/v1/ledger/*` methods. Web transaction detail only patches metadata. |
| Affected files | `ledger.controller.ts`, `packages/schemas/src/ledger.ts`, `packages/schemas/src/splits.ts`, `packages/api-client/src/client.ts`, web transaction/ledger UI |
| Runtime path | Missing: API → service → persist for refund/splits; client/UI absent |
| Financial consequence | Users cannot exercise refund/split via product surface; spending can stay wrong if only seed/tests create refunds |
| Still reproducible | **YES** |
| Proposed fix | Zod + `POST .../refunds`; `POST .../events/:id/splits` using `transactionSplitsSchema` + `replaceSplits`; api-client methods; minimal UI path for refund |
| Dependencies | R1 atomic persist (done) |
| Classification | **PRODUCT_PATH** |

---

## P0-A6 — Metric registry integrity

| Field | Value |
|---|---|
| Original finding | Weak `inputHash`; bundle version in meta; hardcoded asOf; yearly fake hash; no historical version serve |
| Proof (current) | `METRIC_REGISTRY_VERIFICATION.md` FAIL on inputHash depth, yearly hash, historical formula serve, asOf coherence |
| Affected files | `metric-registry.service.ts`, `household-metrics.service.ts`, `reports.service.ts`, dashboard/NW consumers |
| Runtime path | Metrics serving / snapshot meta — not ledger write correctness |
| Financial consequence | Reproducibility / versioning claims; core totals already agree on demo |
| Still reproducible | **YES** |
| Proposed fix | **Deferred to R4** per batch rule |
| Dependencies | None for R3 |
| Classification | **METRIC_REGISTRY_SEMANTICS** |

---

## P0-A7 — Vehicle purchase / financed purchase runtime

| Field | Value |
|---|---|
| Original finding | Cash purchase builder unit-only; seed openings; no financed purchase ledger builder |
| Proof (current) | `buildAssetPurchaseAtFairValue` only in engine unit test. No `createAssetPurchase` in API. Seed: vehicle ASSET `openingBalanceMinor=300k`; financed loan opening in `seed-vehicles.ts` without purchase event |
| Affected files | `postings.ts`, `economic-events.service.ts`, `ledger.controller.ts`, schemas, `demo-household.ts` / `seed-vehicles.ts` |
| Runtime path | Missing domain command + HTTP for cash/financed purchase |
| Financial consequence | Purchase not represented as balanced event; NW/cash/debt can be openings-only fiction |
| Still reproducible | **YES** |
| Proposed fix | `createAssetPurchase` + financed builder (asset + cash down + loan) + API + seed prefers events |
| Dependencies | R1 persist |
| Classification | **RUNTIME_FINANCIAL_CORRECTNESS** |

---

## P0-A8 — Reversal / correction

| Field | Value |
|---|---|
| Original finding | Status enum unused for economics |
| Proof (current) | `REVERSED`/`CORRECTED` only on `source_transactions.status` enum; never written. `reconstructBalances` / `periodEventTotals` ignore status. `financial_events` has no status. |
| Affected files | `schema-economic.ts`, `ledger-truth.service.ts`, `household-metrics.service.ts`, new reverse command |
| Runtime path | No reverse/correct API; all events always active in reconstruct + period totals |
| Financial consequence | Cannot undo spend; corrections risk double-count if naïvely re-posted |
| Still reproducible | **YES** |
| Proposed fix | `financial_events.status` ACTIVE\|REVERSED\|CORRECTED; reverse command sets REVERSED; reconstruct + period totals exclude non-ACTIVE; revise marks CORRECTED when replacing meaning (or keep ACTIVE after in-place revise — document) |
| Dependencies | R1 atomic revise |
| Classification | **RUNTIME_FINANCIAL_CORRECTNESS** |

---

## Valuation vs depreciation (rule for R3)

| Concept | Meaning | Storage |
|---|---|---|
| Valuation estimate | Point-in-time estimate on vehicle row (`estimatedValue*Minor`, `valuationAsOf`) | Metadata / display |
| Depreciation | Authoritative economic write-down | `ASSET_DEPRECIATION` ledger event + postings |

**Rule:** Valuation updates alone must **not** auto-post depreciation. Explicit `createAssetDepreciation` (or incremental valuation-driven command that posts **delta** once) is the only path that changes ledger asset balance. Seed may align mid valuation to ledger after depreciation; they are not dual SoTs.

---

## Exclude semantics (V1 rule)

`isExcluded` on source transactions removes the linked financial event from **period metrics** (income/spending/savings) and list overviews. It does **not** reverse ledger balances (cash already moved). Re-include restores metrics exactly once.

---

## Period semantics (V1 rule)

Ledger economics use `financial_events.occurredOn` (= booking date on source txs at create). Metrics period filters use `occurredOn`. SEK-only for aggregation in V1.

---

## Opening balances (V1 rule)

`accounts.openingBalanceMinor` establishes position at t0. Not income/expense. Not included in period event totals. Liabilities/assets openings create position without current-period cashflow.
