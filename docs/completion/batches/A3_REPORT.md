# Batch A3 — Money Input + Depreciation Report

**Status:** COMPLETE  
**Branch:** `cursor/batch-a3-money-depreciation-9c58`  
**Base:** `cursor/batch-a2-ledger-runtime-truth-9c58`  
**PR:** https://github.com/darrefreak/ekonomi/pull/31  
**Date:** 2026-08-07

---

## Fixed acceptance issues

| Issue | Result |
|---|---|
| Float money input (`Number * 100`) | **FIXED** — bigint öre parsing in `@ffos/domain`; web delegates |
| Vehicle depreciation ledger missing | **FIXED** — `buildAssetDepreciation` + runtime persist + seed |
| Seed ASSET vs valuation mid diverge | **FIXED** — opening 300k, write-down 20k → ledger 280k (= mid) |
| Depreciation invariant 300→280 | **FIXED** — unit + persisted integration test |

Not in A3:

| Issue | Status |
|---|---|
| P0-5 validation breadth | Remaining (S1) |
| P0-8 metric registry | Remaining (C2) |
| Broader P1/P2/P3 | Remaining |

---

## Money input

- `kronorStringToMinor` / `minorToKronorString` in `packages/domain/src/money.ts`
- Integer-only arithmetic (whole * 100 + fractional öre)
- `apps/web/src/lib/money-input.ts` is a thin wrapper — no float conversion
- Domain tests cover comma/dot, signs, and large values that would drift with `Number`

---

## Depreciation architecture

| Field | Value for 20k write-down |
|---|---|
| Event type | `ADJUSTMENT` (non-cash write-down) |
| Postings | Debit EXPENSE, Credit ASSET |
| `expenseAmountMinor` | `0` (cashflow spending unchanged) |
| `netWorthDeltaMinor` | `-2000000` |
| Economic cost | Tracked on `vehicle_cost_events` (DEPRECIATION 20k) |

Runtime: `EconomicEventsService.createAssetDepreciation`  
API: `POST /api/v1/ledger/assets/depreciation`

---

## Demo seed coherence

| Account | Opening | Ledger ending | Reported | Notes |
|---|---|---|---|---|
| Familjebil (ASSET) | 300 000 | 280 000 | 280 000 | Matches `estimatedValueMidMinor` |
| Vehicle cost DEPRECIATION | — | 20 000 economic | — | Aligned with ledger event 2026-07-31 |

Clean seed reconciles with **0 mismatches**.

---

## Tests added

- Domain: integer öre parse/format
- Engine: depreciation 300→280 unit test
- API: `depreciation-invariants.test.ts` persisted path

---

## Remaining problems

- Classification/edit UI still does not auto-rebuild every economic meaning change (A2 residual).
- Cashflow “spending” is still `sum(expenseAmountMinor)`; depreciation correctly contributes 0 there — economic cost lives in vehicle metrics/TCO.
- P0-5 / P0-8 remain for later batches.

---

## Gates

| Gate | Result |
|---|---|
| Build | PASS |
| Lint | PASS |
| Typecheck | PASS |
| Tests | PASS |
| Docker | PASS (`/health/ready`) |
| Demo seed | PASS (vehicle ledger 280k, 0 mismatches) |

---

## STOP

A3 is complete. Do **not** start the next batch until explicitly instructed.
