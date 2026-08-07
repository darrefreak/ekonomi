# Phase 2 Report — Economic foundation

**Date:** 2026-08-07  
**Status:** COMPLETE — STOPPED (awaiting `START PHASE 3`)  
**Branch:** `cursor/phase-2-economic-foundation-9c58`

## 1. Completed items

### Database / migrations

- Migration `0001_phase2_economic.sql`
- Tables: data_sources, import_batches, raw_import_records, categories, merchants, accounts, account_balance_snapshots, source_transactions, financial_events, source_transaction_links, ledger_entries, ledger_postings, transaction_splits, reconciliation_groups
- Enums for account types, event types, posting sides, connection/import/processing statuses

### Financial engine

- Balanced ledger posting builders in `@ffos/financial-engine/ledger`
- Invariant tests:
  - internal transfer
  - investment transfer
  - credit card purchase + payment
  - mortgage principal/interest
  - vehicle/asset cash purchase at fair value
- `calculateNetSavingsRate`

### Deterministic demo seed

- `DEMO_AS_OF_DATE` / `DEMO_RANDOM_SEED` driven
- Demo user: `demo@ffos.local` / `demo-password-123`
- ~24 months history, **311** financial events in verified run
- Includes: salaries, barnbidrag, mortgage splits, internal transfers, Avanza investments, electricity seasonality, Netflix price increases, credit card groceries + payments, fuel, July vacation, anomaly Swish, raw import record, balance snapshots

### API

- `GET /api/v1/accounts`
- `GET /api/v1/accounts/:id`
- `GET /api/v1/transactions`
- Dashboard reads seeded account balances + monthly financial_events (falls back to previous month when asOf is the 1st)

### Web

- Accounts list from API
- Transactions list from API
- Dashboard prefers demo login against seeded household

## 2. Architecture decisions

1. Ledger postings always positive minor units with explicit debit/credit side; engine asserts balance.
2. System EXPENSE/INCOME books exist as accounts for double-entry without polluting user account lists.
3. Source transactions link to financial events; UI lists source transactions.
4. Ending balances are seeded as verified snapshots (illustrative product story); full ledger→balance reconstruction can tighten in Phase 3.
5. Dashboard “this month” uses latest non-empty month on/before asOf so Aug 1 demos show July activity.

## 3. Tests

| Suite | Status |
|---|---|
| Ledger invariant tests | ✅ |
| Net worth / money / format | ✅ |
| `pnpm test` | ✅ |

## 4. Build / lint / typecheck / migrations / Docker

| Check | Status |
|---|---|
| `pnpm build` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm db:migrate` | ✅ |
| `pnpm db:seed` | ✅ (311 events) |
| Docker infra (postgres/redis/minio/mailpit) | ✅ running |
| UX smoke (`/`, `/accounts`, `/transactions`) | ✅ HTTP 200 |
| Demo login → dashboard seeded metrics | ✅ |

## 5. Known limitations

- Account `currentBalanceMinor` is seeded cache, not fully recomputed from all postings at end of seed.
- Mortgage event type stored as `LOAN_PRINCIPAL` even though interest is included in the same balanced entry (split visible in postings/memos).
- Transactions UI is a simple list (Phase 3 polish).
- Lint scripts remain stubs outside Next build-time checks.

## 6. Intentionally deferred

- Phase 3 product polish: cashflow, net worth pages, review queue, coverage UI
- Forecast/risk/opportunities
- Vehicle TCO domain
- Real connectors

## 7. Suggested next phase

Await: **`START PHASE 3`**

## 8. STOP

Phase 2 complete. **Phase 3 not started.**
