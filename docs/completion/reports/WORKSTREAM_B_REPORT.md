# Workstream B Report — Transactions & Accounts

**Date:** 2026-08-07  
**Branch:** `cursor/workstream-b-transactions-accounts-9c58`  
**Status:** COMPLETE for scoped B goals

---

## Completed requirements

1. **Account CRUD**
   - `POST /api/v1/accounts` create (name, type, provider, shared, opening balance, credit limit)
   - `PATCH /api/v1/accounts/:id` update
   - `DELETE /api/v1/accounts/:id` soft-archive (`archived_at`)
   - List excludes archived by default

2. **Account detail**
   - Balances, period I/E, freshness/connection, balance history rendered
   - Recent transactions link to detail; edit + archive UI

3. **Transaction list**
   - Search, account, from/to dates, include-excluded
   - Rows navigate to detail; empty/error/retry states

4. **Transaction editing**
   - `GET/PATCH /api/v1/transactions/:id`
   - Category, notes, tags, exclusion
   - Related transfer counterparts via `transferGroupId`

5. **Categories list**
   - `GET /api/v1/categories?householdId=`

6. **Mobile Mer**
   - `/more` lists desktop IA links (including Konton)

7. **api-client + schemas**
   - Create/update/archive account, get/update transaction, list categories

8. **Tests**
   - Schema + DB mutation test (create/update/archive + txn patch)

---

## Remaining / deferred

- Merchant CRUD / free-text merchant assign
- Hard delete accounts with ledger dependents
- Optimistic UI / TanStack Query adoption (stack debt)
- Review-queue “resolve” shortcut into classification (ties to later WS)

---

## Schema / API / UI

| Area | Change |
|---|---|
| Migration | `0008_workstream_b_accounts.sql` — `accounts.archived_at` |
| API | Account POST/PATCH/DELETE; txn GET/PATCH; categories GET |
| UI | Accounts create/edit/archive; txn filters + detail; Mer menu |
| Client | Matching typed methods |

---

## Gate results

| Gate | Result |
|---|---|
| `pnpm build` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ (incl. accounts.mutations.test) |
| `pnpm lint` | ✅ (echo stubs — known) |
| `pnpm db:migrate` | ✅ |
| Mobile Mer | ✅ real menu (code) |
| Desktop money flows | ✅ build includes `/transactions/[id]`, `/more` |

---

## Known issues

- Creating accounts starts as `DISCONNECTED` / manual freshness (honest for non-synced).
- Transaction description edit exposed in schema but UI focuses on classify fields (description optional via API).

---

## STOP

Workstream B complete for its scope.  
Do **not** auto-start C. Await: `START WORKSTREAM C`
