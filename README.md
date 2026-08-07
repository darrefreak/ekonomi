# Family Financial OS

Ett komplett ekonomiskt operativsystem för hushållet — inte en vanlig budgetapp.

## Status

**V1 roadmap komplett (Phase 0–8)** ✅

| Phase | Focus | Report |
|---|---|---|
| 0 | Architecture | `docs/phase-reports/PHASE_0_REPORT.md` |
| 1 | Foundation | `docs/phase-reports/PHASE_1_REPORT.md` |
| 2 | Economic foundation | `docs/phase-reports/PHASE_2_REPORT.md` |
| 3 | Core product | `docs/phase-reports/PHASE_3_REPORT.md` |
| 4 | Planning | `docs/phase-reports/PHASE_4_REPORT.md` |
| 4B | Vehicles | `docs/phase-reports/PHASE_4B_REPORT.md` |
| 5 | Decision engines | `docs/phase-reports/PHASE_5_REPORT.md` |
| 5B | Vehicle intelligence | `docs/phase-reports/PHASE_5B_REPORT.md` |
| 6 | Data intake | `docs/phase-reports/PHASE_6_REPORT.md` |
| 7 | AI advisor (tool layer) | `docs/phase-reports/PHASE_7_REPORT.md` |
| 8 | Polish | `docs/phase-reports/PHASE_8_REPORT.md` |

Demo efter seed:

```bash
pnpm db:seed
# login: demo@ffos.local / demo-password-123
```

## Quick start

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres redis minio mailpit
pnpm db:migrate
pnpm db:seed
pnpm --filter @ffos/api dev
pnpm --filter @ffos/web dev
```

API default: `http://localhost:3001`  
Web default: `http://localhost:3000`  
Postgres host port i `.env.example` (ofta `5436` om `5432` är upptagen).

## Commands

| Command | Description |
|---|---|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Dev all apps |
| `pnpm build` | Build all packages/apps |
| `pnpm lint` | Lint |
| `pnpm typecheck` | Typecheck |
| `pnpm test` | Tests |
| `pnpm db:migrate` | Run migrations |
| `pnpm db:seed` | Seed demo household |
| `pnpm db:reset` | Drop schema, migrate, seed |

## Principles

1. Externa källor är inte den primära ekonomiska modellen.
2. Deterministiska funktioner producerar siffror; AI förklarar.
3. Pengar = `amountMinor: bigint` (aldrig JS float).
4. Ekonomisk logik i `@ffos/financial-engine` (ingen React/Nest/DB).
5. Alla frågor är household-scoped.

## Documentation

See [`docs/`](docs/README.md) and [`docs/ROADMAP.md`](docs/ROADMAP.md).
