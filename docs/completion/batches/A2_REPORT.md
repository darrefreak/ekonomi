# Batch A2 — Ledger Runtime Truth Report

**Status:** COMPLETE  
**Branch:** `cursor/batch-a2-ledger-runtime-truth-9c58`  
**PR:** https://github.com/darrefreak/ekonomi/pull/30  
**Date:** 2026-08-07

---

## Fixed acceptance issues

| Issue | Result |
|---|---|
| P0-1 ledger ≠ cache SoT | **FIXED** — metrics/position reconstruct from openings + postings |
| P0-7 splits/recon product path | **FIXED (runtime)** — transfer / CC / mortgage split / investment / refund persist via `EconomicEventsService` + API |
| Persisted financial invariant coverage | **FIXED** — integration tests 1–6 + refund |
| Downstream metrics stale/cached truth | **FIXED** for dashboard / NW / AI snapshot path |
| Reconciliation job placeholder | **FIXED** — `RECONCILE_ACCOUNT_BALANCES` executes real work |
| Demo seed cache vs ledger | **FIXED** — openings + reported persisted; demo reconciles MATCHED |

Not in A2 (remain for later batches):

| Issue | Status |
|---|---|
| P0-5 validation breadth | Remaining (A3+ / later) |
| P0-8 metric registry | Remaining (minimum not expanded) |
| Vehicle depreciation | Remaining (A3) |
| Float money input UI | Remaining (A3) |

---

## Source-of-truth architecture

| Concept | Meaning | Storage |
|---|---|---|
| **Opening balance** | Authoritative start for reconstruction | `accounts.opening_balance_minor` |
| **Ledger-calculated balance** | Opening + posting deltas via `reconstructBalances` | Computed; cached into `current_balance_minor` |
| **Reported balance** | Provider/bank evidence | `accounts.reported_balance_minor` |
| **Reconciled balance** | Set only when reported ≡ ledger (MATCHED) | Snapshot field; never forced |
| **Cache / snapshot** | Derived performance artifact | Must be rebuilt from ledger; never competing truth |

Rules:

1. Financial calculations use ledger reconstruction (or a cache **after** ledger refresh).
2. Provider reported balance never silently overwrites ledger.
3. Mismatch stays visible until explicitly resolved.
4. No silent ADJUSTMENT postings.

See also: `A2_CACHE_CLASSIFICATION.md`, `A2_CURRENT_DATA_FLOW.md`.

---

## Runtime flows verified

| Flow | Path | Result |
|---|---|---|
| Internal transfer | API → `EconomicEventsService` → `persistBalancedEvent` → postings → cache refresh | Expense 0, NW unchanged |
| Credit card purchase + payment | Same | Purchase expense once; payment expense 0; liability settles |
| Mortgage principal/interest | Splits persisted + postings | Cash −total, debt −principal, expense = interest, NW −interest |
| Investment transfer | Cash → investment | Expense 0, NW unchanged |
| Refund | Cash refund builder | Negative expense, not unrelated income |
| Reconciliation | `LedgerTruthService` + BullMQ job | MISMATCH detectable; reported preserved |

---

## Tests added

Engine:

- `packages/financial-engine/src/ledger/reconcile.test.ts`

API persisted invariants (`apps/api/src/ledger/ledger-invariants.test.ts`):

1. Internal transfer  
2. Credit card purchase + payment  
3. Mortgage split  
4. Investment transfer  
5. Reconciliation mismatch (no silent overwrite)  
6. Retry/idempotency (externalId + reconcile snapshots)  
7. Refund expense offset  

---

## Invalidation / recalculation strategy

1. Economic write → `refreshDerivedCaches(householdId, asOf)`  
2. Job `RECONCILE_ACCOUNT_BALANCES` → `reconcileHousehold` (idempotent jobId per household/day)  
3. `getFinancialSnapshot` always reconstructs from openings + postings (does not trust stale cache)  
4. NW history snapshots rebuilt from openings + dated postings  

---

## Remaining problems

- Transaction **edit/classification** UI path still primarily mutates source-transaction metadata; full rebuild-on-reclassify for every classification change is not exhaustively wired (runtime builders cover intentional economic writes).
- Debt/wealth list endpoints still read `currentBalanceMinor` as **VALID_CACHE** (kept coherent by refresh); they do not independently reconstruct on every read.
- Docker images must be rebuilt to pick up A2 worker job handler (infra health verified).
- P0-5 / P0-8 / depreciation / float money input remain outside A2.

---

## Gates

| Gate | Result |
|---|---|
| Build | PASS |
| Lint | PASS |
| Typecheck | PASS |
| Tests | PASS (engine + API including A2 invariants) |
| Docker | PASS (postgres/redis healthy; `/health/ready` ok; demo seed coherent, 0 mismatches) |

---

## STOP

A2 is complete. **Do not start A3** until explicitly instructed: `START BATCH A3`.
