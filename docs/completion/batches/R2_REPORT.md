# Batch R2 — Exact Money Extract + Ledger-Truth Residuals

**Status:** COMPLETE (batch scope)  
**Branch:** `cursor/batch-r2-money-ledger-truth-9c58`  
**Base:** `cursor/batch-r1-atomic-idempotency-9c58`  
**Date:** 2026-08-08  

**Does not claim P0 financial core accepted.**

---

## Scope

| ID | Item | Result |
|---|---|---|
| **P0-A3** | Document mock-extract float → exact kronor parse | **FIXED** |
| **P0-A5** | Accounts list / debt detail / NW history residuals | **FIXED** |

Out of scope: P0-A4, P0-A6, P0-A7, P0-A8, UI redesign, metric registry semantics.

---

## P0-A3 changes

| File | Change |
|---|---|
| `apps/api/src/intake/mock-extract.ts` | `parseExtractAmountToken` via `kronorStringToMinor`; reject scientific / malformed; no `Number * 100` |
| `apps/api/src/intake/mock-extract.test.ts` | Exact large-value + scientific rejection tests |

Seed seasonality float in `demo-household.ts` remains seed-only (not runtime V1 extract path).

---

## P0-A5 changes

| Surface | Change |
|---|---|
| Accounts list | Reconstruct ledger balances via `LedgerTruthService.reconstructHousehold` before mapping |
| Debt detail | Overlay `getLedgerAlignedAccountRows` outstanding |
| `primaryMortgageContext` | Ledger-aligned principal |
| NW history | `ensureNetWorthHistorySnapshots` upserts (replace-per-day); `refreshDerivedCaches` invalidates `nw_history_reconstruct` after mutations |

---

## Tests

- R2-A3 extract exact + scientific reject  
- R2-A5 accounts list ignores poisoned cache  
- R2-A5 debt detail / mortgage context ledger-aligned  
- R2-A5 NW history reflects post-mutation ledger  

Regression: R1 / A2 / A3 / S1 suites remain green.

---

## Remaining P0 blockers

| ID | Item |
|---|---|
| P0-A4 | Refund HTTP + general split product API/UI |
| P0-A6 | Metric inputHash / asOf / historical version serve |
| P0-A7 | Vehicle purchase / financed purchase runtime |
| P0-A8 | REVERSED / CORRECTED operational semantics |

---

## Gates

| Gate | Result |
|---|---|
| Exact document money extract | **PASS** |
| Accounts list ledger-aligned | **PASS** |
| Debt detail ledger-aligned | **PASS** |
| NW history refresh after mutation | **PASS** |
| R1 regressions | **PASS** |
| Build / Lint / Typecheck / Tests / Docker | *(see stop report)* |

**FINANCIAL CORE ACCEPTED: NO**
