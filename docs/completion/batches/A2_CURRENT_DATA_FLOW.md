# A2 — Current Financial Data Flow (pre-change)

**Date:** 2026-08-07  
**Branch tip before A2 implementation:** acceptance audit / Workstream O

---

## Legend — value origins

| Tag | Meaning |
|---|---|
| CACHE | `accounts.currentBalanceMinor` |
| LEDGER | Sum of openings + `ledger_postings` via `reconstructBalances` |
| SNAPSHOT | `account_balance_snapshots` |
| EVENTS | Aggregates from `financial_events` / `source_transactions` |
| SEED | Written only at seed time |
| HARDCODE | Fixed constant (should not appear) |

---

## Account balance (list / detail)

| Layer | Current |
|---|---|
| DB | `accounts.currentBalanceMinor` (CACHE); snapshots optional |
| Service | `AccountsService.toListItem` → CACHE |
| API | `GET /accounts`, `GET /accounts/:id` |
| UI | `MoneyValue` on CACHE |
| Origin | SEED reconstruct then CACHE; **not** recomputed on read |

Openings: ephemeral in seed only — **not queryable**.

---

## Available cash / investments / debt / net worth (dashboard, NW page, AI)

| Layer | Current |
|---|---|
| DB | Account rows CACHE |
| Service | `HouseholdMetricsService.positionFromAccounts` sums CACHE by type → `calculateNetWorth` |
| API | dashboard `position`, net-worth, AI tools |
| Origin | **CACHE** (INVALID as independent SoT if diverged from ledger) |

NW history: `ensureNetWorthHistorySnapshots` reverse-engineers openings from CACHE − postings, then reconstructs — fragile if CACHE wrong.

---

## Monthly income / spending / savings

| Layer | Current |
|---|---|
| DB | `financial_events` expense/income amounts + txns |
| Service | Period metrics over events |
| Origin | **EVENTS** (generally REAL for seeded path) |

---

## Internal transfers / CC / mortgage / investment

| Layer | Current |
|---|---|
| Engine builders | REAL unit tests |
| Persist | `persistBalancedEvent` **seed-only** |
| Runtime API | **None** |
| Product path | Missing (P0-7 / acceptance FAIL) |

---

## Reconciliation

| Layer | Current |
|---|---|
| Helpers | `reconcileCachedBalances` / `applyLedgerBalancesToAccounts` unwired |
| Job | Worker only `HEALTH_CHECK` |
| UI | No mismatch display |

---

## A2 target state (summary)

1. Persist `opening_balance_minor` (+ optional `reported_balance_minor`) on accounts  
2. Authoritative reads = reconstruct(openings, postings)  
3. CACHE updated only as derived ledger snapshot  
4. Real `RECONCILE_ACCOUNT_BALANCES` job  
5. Runtime economic event writes for transfer / CC / mortgage split / investment  
6. Persisted invariant integration tests  
