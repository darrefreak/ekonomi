# Phase 1 — Foundation

**Start only after explicit instruction: `START PHASE 1`.**

## Goal

Skapa körbar monorepo-grund med Docker, API, web app shell, auth/household foundation och health/observability — utan full ekonomisk domän.

## In scope

### Monorepo & tooling

- pnpm workspaces + Turborepo
- Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `db:migrate`, `db:seed`, `db:reset` (seed kan vara minimal/placeholder)
- Shared `packages/config`, `packages/eslint-config`, `packages/utils`, `packages/domain` (money types/enums stubs), `packages/schemas`, `packages/design-tokens`, `packages/api-client` (minimal), `packages/financial-engine` (scaffold only — ingen full ledger än)
- `apps/mobile` reserverad (README placeholder, ingen Expo-app)

### Docker

`docker compose up -d` med:

web, api, worker, postgres, redis, minio, mailpit

Persistent volumes för postgres (och minio).

### Backend (`apps/api`)

- NestJS modular bootstrap
- Modules foundation: auth, users, households, household-members, permissions, feature-flags, settings (minimal), health
- REST `/api/v1` prefix
- OpenAPI/Swagger enabled in dev
- Drizzle + first migrations (users/households/members)
- Redis connection + BullMQ worker stub (minst ett no-op/health job)
- Structured logging + request IDs
- `/health`, `/health/ready`, `/health/live`

### Auth

- Access + refresh token foundation per ADR-0003
- Secure password hashing
- Household-scoped authorization helpers

### Frontend (`apps/web`)

- Next.js + Tailwind + design tokens (light/dark baseline)
- App shell: desktop sidebar + mobile bottom nav
- Navigation structure per UI.md (routes may be placeholders)
- Basic dashboard shell consuming `GET /api/v1/dashboard` (placeholder payload from backend — **not** hardcoded in components)
- Locale formatting helpers (sv-SE) for money display using domain Money type
- Empty/loading states for shell

### Data through backend

Realistic **placeholder** household summary via API (not full 24-month seed — that is Phase 2).

## Out of scope (explicit)

- Full ledger / transactions / accounts domain (Phase 2)
- Deterministic 18–24 month demo seed (Phase 2)
- Real connectors, OCR, BankID
- Vehicle domain implementation (Phase 4B)
- AI advisor (Phase 7)
- Full metric engine (Phase 2–3)
- E2E polish (Phase 8)

## Acceptance checks

1. `pnpm install` works  
2. `docker compose up -d` brings up all services  
3. `pnpm build` / `lint` / `typecheck` / `test` pass (tests may be minimal smoke)  
4. Migrations apply cleanly  
5. Health endpoints respond  
6. Web app shell renders on ~375px and desktop  
7. Dashboard shell loads data from API  
8. No economic domain logic only in React  
9. `financial-engine` has no Nest/React/DB deps  
10. Phase report written; **STOP** — do not start Phase 2

## Suggested first vertical slice

Auth register/login → create household → member as OWNER → fetch dashboard placeholder → render shell.
