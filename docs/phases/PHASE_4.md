# Phase 4 — Planning foundation

**Start only after explicit instruction: `START PHASE 4`.**

## Goal

Inför planeringsytor ovanpå den ekonomiska kärnan: budget, recurring expenses/income, subscriptions, contracts, sinking funds och goals — med deterministic engine-stöd där belopp beräknas.

## In scope

- Budget periods + category allocations vs actuals (from ledger/events)
- Recurring patterns foundation (detected + user-confirmed)
- Subscriptions tracking (amount, cadence, merchant link)
- Contracts (end dates, notice periods) foundation
- Sinking funds / earmarked savings
- Goals (target, deadline, linked funding)
- API read/write foundations for planning entities (mock OK)
- Web pages for budget, subscriptions, contracts, goals (replace Phase 1 placeholders)
- Seed extensions for demo planning data
- Engine helpers for budget remaining / goal progress (deterministic)

## Out of scope

- Vehicle TCO (Phase 4B)
- Forecast / scenarios (Phase 5)
- Real bill OCR / connectors (Phase 6)
- AI recommendations (Phase 7)

## Hard gate

After completion: build/lint/typecheck/test/migrations/Docker/UX checks + `PHASE_4_REPORT.md`, then **STOP**.
