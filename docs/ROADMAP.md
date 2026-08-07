# Roadmap — Family Financial OS

## Phase gates (hard)

Gå **aldrig** automatiskt vidare till nästa phase.

När en phase är komplett:

1. Kör build  
2. Kör lint  
3. Kör typecheck  
4. Kör tester  
5. Kontrollera migrations  
6. Kontrollera Docker  
7. Kontrollera mobile viewport  
8. Kontrollera desktop viewport  
9. Fixa identifierade fel  
10. Dokumentera i `docs/phase-reports/PHASE_X_REPORT.md`

**STOPPA.** Starta nästa phase först efter explicit instruktion: `START PHASE X+1`.

## Phase 0 — Architecture ✅

Dokumentation, ADR:er, invariants, phase boundaries.  
Report: [phase-reports/PHASE_0_REPORT.md](./phase-reports/PHASE_0_REPORT.md).

## Phase 1 — Foundation ✅

Monorepo, Docker (web/api/worker/postgres/redis/minio/mailpit), NestJS, Next.js, shared packages, auth foundation, households/members/permissions, design tokens, app shell, navigation, basic dashboard shell, placeholder data via backend, health endpoints, structured logging.

Detaljer: [phases/PHASE_1.md](./phases/PHASE_1.md).  
Report: [phase-reports/PHASE_1_REPORT.md](./phase-reports/PHASE_1_REPORT.md).

## Phase 2 — Economic foundation ✅

Accounts, balance snapshots, source transactions, financial events, ledger entries/postings, splits, categories, merchants, reconciliation foundation, raw import records, import batches, deterministic mockdata, seed scripts, ledger tests.

Detaljer: [phases/PHASE_2.md](./phases/PHASE_2.md).  
Report: [phase-reports/PHASE_2_REPORT.md](./phase-reports/PHASE_2_REPORT.md).

## Phase 3 — Core product ✅

Dashboard, accounts, transactions, cashflow, net worth, monthly metrics, freshness, coverage, review queue.

Detaljer: [phases/PHASE_3.md](./phases/PHASE_3.md).  
Report: [phase-reports/PHASE_3_REPORT.md](./phase-reports/PHASE_3_REPORT.md).

## Phase 4 — Planning foundation ✅

Budget, recurring, subscriptions, contracts, sinking funds, goals.

Detaljer: [phases/PHASE_4.md](./phases/PHASE_4.md).  
Report: [phase-reports/PHASE_4_REPORT.md](./phase-reports/PHASE_4_REPORT.md).

## Phase 4B — Vehicle foundation ✅

Vehicles, ownership, financing, mileage, actual costs, economic cost, TCO, equity, vehicle UI, vehicle tests.

Detaljer: [phases/PHASE_4B.md](./phases/PHASE_4B.md).  
Report: [phase-reports/PHASE_4B_REPORT.md](./phase-reports/PHASE_4B_REPORT.md).

## Phase 5 — Decision engines ✅

Forecast, backtesting, opportunities, risks, financial health, scenarios, savings optimizer.

Detaljer: [phases/PHASE_5.md](./phases/PHASE_5.md).  
Report: [phase-reports/PHASE_5_REPORT.md](./phase-reports/PHASE_5_REPORT.md).

## Phase 5B — Vehicle intelligence

Market snapshots, valuation ranges, candidates, comparisons, replacement analysis, sell window, vehicle scenarios, mock market intelligence.

Detaljer: [phases/PHASE_5B.md](./phases/PHASE_5B.md).

## Phase 6 — Data intake

Documents, financial inbox, integration UI, import UI, fake sync, connector states, source health, financial coverage.

## Phase 7 — AI

Financial advisor, AI brief, insights, explainability, deterministic tool layer, recommendation tracking.

## Phase 8 — Polish

Accessibility, mobile UX, responsive refinement, testing, performance, security review, error/empty states, final documentation.

## Future (post V1 roadmap notes)

- Riktiga connectors (open banking, brokers, government, Kivra, …)
- `apps/mobile` Expo iOS
- Push notifications / widgets (opt-in för känslig info)
- PDF export of reports
- Automation LEVEL 3/4 (med compliance gate)
- Housing intelligence expansion

## Root commands (from Phase 1+)

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm db:migrate
pnpm db:seed
pnpm db:reset
docker compose up -d
docker compose down
```
