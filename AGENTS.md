# AGENTS.md

## Cursor Cloud specific instructions

Family Financial OS is a pnpm + Turborepo monorepo (Node ≥ 20, pnpm 9). Services:
`@ffos/api` (NestJS REST API, port 3001), a BullMQ worker (same package), and
`@ffos/web` (Next.js 15, port 3000). Backing infra is PostgreSQL 16, Redis 7,
MinIO, and Mailpit. Standard commands and the local quick start live in
`README.md`; the test topology lives in `docs/testing/TEST_TOPOLOGY.md`. Only the
non-obvious, environment-specific gotchas are captured below.

### One-time setup already baked into the VM

- Docker Engine + compose plugin are installed (needed for the infra services).
  The daemon is not started automatically — run `sudo dockerd` (e.g. in a
  dedicated tmux session) if `docker info` fails, then `sudo chmod 666
  /var/run/docker.sock` so `docker` works without sudo.
- `pnpm install` (the update script) restores workspace dependencies.

### Starting the stack (do this each session)

1. Ensure `dockerd` is running, then start infra:
   `docker compose up -d postgres redis minio mailpit`
   (Postgres is published on host port **5436**, not 5432. The compose init
   script creates both `ffos_dev` and `ffos_test`.)
2. Create env files (git-ignored) if missing:
   - `cp .env.example .env` then `pnpm secrets:dev` (generates the required
     `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — the API refuses to start
     without them).
   - `.env.test` is required by `pnpm test`; it must point `DATABASE_URL` at a
     database whose name ends in `_test` (see `docs/testing/TEST_TOPOLOGY.md`
     for the exact contents).
3. Build once before seeding — the seed/API import the **built** workspace
   packages (`@ffos/domain` etc.), so a fresh checkout must `pnpm build` (or at
   least build the packages) before `pnpm db:seed`, or you get
   `Cannot find module '.../@ffos/domain/dist/index.js'`.
4. Migrate + seed the dev DB: `pnpm db:migrate` then `pnpm db:seed`
   (demo login: `demo@ffos.local` / `demo-password-123`).

### GOTCHA 1 — the API/worker do NOT auto-load `.env`

There is no dotenv anywhere in `apps/api`. `pnpm db:migrate`, `pnpm db:seed`,
and the API/worker processes read `DATABASE_URL`, `REDIS_URL`, `JWT_*`, etc.
straight from the process environment. Export the file first, e.g.:
`set -a && . ./.env && set +a && <command>`.
For the web dev server, export `NEXT_PUBLIC_API_URL=http://localhost:3001` and
`NEXT_PUBLIC_FFOS_SHOW_DEMO=true` (the latter enables the one-click demo login).

### GOTCHA 2 — run the NestJS API/worker from the BUILD, not `tsx watch`

`pnpm --filter @ffos/api dev` / `pnpm dev` use `tsx watch` (esbuild). esbuild
elides imports that are only referenced as constructor **type** annotations, so
NestJS dependency injection receives `undefined` for those providers. This
surfaces at runtime as `TypeError: Cannot read properties of undefined
(reading 'refreshDerivedCaches')` on any ledger write (create transaction /
transfer / etc.), even though the server boots and login works. The compiled
output (`tsc`) does not have this problem, and the test suite is unaffected
because tests construct services manually rather than through DI.

Run the API and worker from the build instead (web is fine on `next dev`):

```
pnpm build                       # or: pnpm --filter @ffos/api build
set -a && . ./.env && set +a
node apps/api/dist/main.js       # API on :3001
node apps/api/dist/worker.js     # worker (separate shell)
pnpm --filter @ffos/web dev      # web on :3000 (with the NEXT_PUBLIC_* vars above)
```

After changing API source, re-run `pnpm --filter @ffos/api build` and restart
the node process (or use `node --watch apps/api/dist/main.js` alongside a
`tsc -p apps/api/tsconfig.build.json --watch` rebuild loop). Alternatively,
`docker compose up -d --build api worker web` runs the same compiled code.
This does not affect `pnpm build`, `pnpm lint`, `pnpm typecheck`, or `pnpm test`.

### Tests / lint / typecheck

- `pnpm lint` and `pnpm typecheck` work as-is.
- `pnpm test` (`node scripts/run-tests.mjs`) builds, migrates+seeds `ffos_test`,
  then runs unit + DB-backed suites serially (~several minutes). It requires
  `.env.test` and a reachable Postgres/Redis. It intentionally fails if fewer
  than the expected number of DB-backed tests execute.
