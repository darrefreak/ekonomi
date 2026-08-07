# Tech stack — Family Financial OS

## Runtime & tooling

| Layer | Choice |
|---|---|
| Language | TypeScript (end-to-end) |
| Monorepo | pnpm workspaces + Turborepo |
| Node | 20 (Docker images) |
| Package manager | pnpm 9 |

## Apps

| App | Stack | Default port |
|---|---|---|
| `apps/web` | Next.js (App Router) + React + Tailwind CSS + design tokens | 3000 |
| `apps/api` | NestJS + Zod validation + OpenAPI/Swagger | 3001 |
| `apps/api` worker | BullMQ consumer (`worker.ts`) | — |
| `apps/mobile` | Reserved (Expo) — not in V1 |

## Data & infra

| Service | Choice | Host port (compose default) |
|---|---|---|
| Database | PostgreSQL 16 + Drizzle ORM (SQL migrations) | 5436 → 5432 |
| Cache / queues | Redis 7 + BullMQ | 6379 |
| Object storage | MinIO (S3-compatible) | 9000 / console 9001 |
| Mail (dev) | Mailpit | SMTP 1025, UI 8025 |

## Shared packages

| Package | Role |
|---|---|
| `@ffos/domain` | Money types, enums, value objects |
| `@ffos/schemas` | Shared Zod DTOs |
| `@ffos/financial-engine` | Deterministic financial math (no React/Nest/DB) |
| `@ffos/api-client` | Typed REST client |
| `@ffos/design-tokens` | CSS variables / theme |
| `@ffos/utils` | Small shared helpers |

## Auth & API style

- JWT access + refresh tokens, bcrypt password hashes
- REST under `/api/v1/*`, household-scoped via `householdId`
- Money over the wire: `{ amountMinor: string, currency }`

## Docker

- Compose file: `docker-compose.yml`
- Images: `infrastructure/docker/Dockerfile.api`, `Dockerfile.web`
- Free-port override example: `docker-compose.ports.yml` (web **3100**, api **3101**)

```bash
# Infra only (already common in local/dev)
docker compose up -d postgres redis minio mailpit

# Full stack on alternate host ports (avoids 3000/3001 clashes)
docker compose -f docker-compose.yml -f docker-compose.ports.yml up -d --build
```

## Docs map

- Architecture & boundaries: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Roadmap / phases: [ROADMAP.md](./ROADMAP.md)
- ADRs: [adr/](./adr/)
