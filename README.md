# Family Financial OS

Ett komplett ekonomiskt operativsystem för hushållet — inte en vanlig budgetapp.

## Status

**Phase 1 — Foundation** ✅ (se `docs/phase-reports/PHASE_1_REPORT.md`)  
Nästa: vänta på `START PHASE 2`.

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

Full stack via Docker (efter `pnpm build`):

```bash
docker compose up -d
```

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
| `pnpm db:seed` | Seed feature flags |
| `pnpm db:reset` | Drop schema, migrate, seed |

## Documentation

See [`docs/`](docs/README.md). Phase reports in `docs/phase-reports/`.

## Principles

1. Externa källor är inte den primära ekonomiska modellen.
2. Deterministiska funktioner producerar siffror; AI förklarar.
3. Pengar = `amountMinor: bigint` (aldrig JS float).
4. Ekonomisk logik i `@ffos/financial-engine` (ingen React/Nest/DB).
5. Alla frågor är household-scoped.
