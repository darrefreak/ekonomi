# Phase 4B — Vehicle foundation

**Start only after explicit instruction: `START PHASE 4B`.**

## Goal

Inför fordonsdomänen: ownership, financing/lease, mileage, actual costs, economic cost, TCO, equity och grundläggande vehicle UI + tester.

## In scope

- Vehicle + ownership models
- Finance / lease agreements foundation
- Odometer / usage profile
- Cost events (fuel, maintenance, insurance, tax, parking, …)
- Deterministic TCO / equity helpers in financial-engine
- Seed demo vehicle(s)
- API read endpoints for vehicles and costs
- Web: `/vehicles`, `/vehicles/[id]` (+ cost/maintenance stubs wired where ready)
- Vehicle-focused tests

## Out of scope

- Market intelligence / replacement analysis (Phase 5B)
- Real vehicle registry connectors
- AI recommendations

## Hard gate

After completion: build/lint/typecheck/test/migrations/Docker/UX checks + `PHASE_4B_REPORT.md`, then **STOP**.
