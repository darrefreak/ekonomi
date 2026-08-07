# Phase 2 — Economic foundation

**Start only after explicit instruction: `START PHASE 2`.**

## Goal

Inför den ekonomiska kärnmodellen: accounts, source transactions, financial events, household ledger, categories/merchants, raw import + batches, deterministic demo seed, och ledger-tester.

## In scope

- Account + AccountBalanceSnapshot
- SourceTransaction (+ status/dedupe foundations)
- FinancialEvent → LedgerEntry → LedgerPosting
- TransactionSplit, SourceTransactionLink, ReconciliationGroup foundation
- Categories taxonomy seed + Merchants
- raw_import_records + ImportBatch
- Deterministic mockdata (18–24 months) with `DEMO_AS_OF_DATE` / `DEMO_RANDOM_SEED`
- `pnpm db:seed` / `pnpm db:reset` expanded
- Ledger tests: transfer, credit card, mortgage examples from domain invariants
- API endpoints for accounts/transactions (read-focused OK)
- Wire dashboard placeholders toward seeded metrics where ready

## Out of scope

- Full polished product UI for every money page (Phase 3)
- Forecast/risk/AI
- Vehicle TCO engine (Phase 4B)
- Real connectors

## Hard gate

After completion: build/lint/typecheck/test/migrations/Docker/UX checks + `PHASE_2_REPORT.md`, then **STOP**.
