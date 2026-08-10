# R2 — Current Audit (money exactness + ledger-truth residuals)

**Date:** 2026-08-08  
**Branch:** `cursor/batch-r2-money-ledger-truth-9c58`  
**Scope:** P0-A3 + P0-A5 only. No P0-A4/A6/A7/A8. No UI redesign.

---

## P0-A3 — Document extract float money

| Location | Status | Notes |
|---|---|---|
| `apps/api/src/intake/mock-extract.ts` `inferAmount` | **UNSAFE_MONEY** | `BigInt(Math.round(Number(raw) * 100))` |
| Core ledger forms / Zod | SAFE | Already use `kronorStringToMinor` / minor strings |
| Seed seasonality float (`demo-household.ts`) | Seed-only | Out of R2 strict A3 file scope; not a runtime API path |

**Target:** parse with `kronorStringToMinor`; reject scientific / >2dp / malformed; tests.

---

## P0-A5 — Ledger truth residuals

| Surface | Status | Notes |
|---|---|---|
| Accounts **list** | Cache-first | `toListItem` uses `currentBalanceMinor` without reconstruct |
| Accounts **detail** | Ledger overlay | Uses `getAuthoritativeBalances` when ledger injected |
| Debt **list** | Ledger-aligned | Uses `getLedgerAlignedAccountRows` |
| Debt **detail** | Cache-first | `mapItem(row)` without ledger overlay |
| `primaryMortgageContext` | Cache-first | Uses `mortgage.currentBalanceMinor` |
| NW history snapshots | Stale risk | `ensureNetWorthHistorySnapshots` insert-if-missing; not refreshed after later postings |

**Target:** list + debt detail + mortgage context ledger-aligned; invalidate/refresh NW history after ledger mutations; ensure upserts reconstructed balances.
