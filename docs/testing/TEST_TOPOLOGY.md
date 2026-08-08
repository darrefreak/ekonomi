# Test topology

**Status:** in force
**Introduced by:** RT2 critical remediation
**Reason:** RT2-005
**Supersedes the topology described in:**
[`docs/acceptance/TEST_ENVIRONMENT_ISOLATION.md`](../acceptance/TEST_ENVIRONMENT_ISOLATION.md)
(kept as the record of what was wrong)

---

## What was wrong

`pnpm test` reported green without running a single database-backed test. Turborepo runs
tasks in `strict` env mode and the `test` task declared no env allowlist, so `DATABASE_URL`
was stripped before the suite started; 129 guards of the form
`if (!process.env.DATABASE_URL) return;` then fired and every one of them counted as a
pass. The API suite finished in 2.2 s instead of 33 s, and an unchanged repository skipped
even that with `18 cached, 12 ms >>> FULL TURBO`. When the variable *was* exported it
pointed at the same database the running application mutated.

The principle now enforced:

> A required test that could not run has not passed. Missing infrastructure is a failure,
> never a silent skip.

---

## Databases

| Purpose | Database | Who uses it |
|---|---|---|
| Development | `ffos_dev` | `docker compose` API, worker, web; `pnpm dev`; E2E suites; the repro scripts |
| Test | `ffos_test` | `pnpm test` and everything it runs, only |

One PostgreSQL 16 instance on `localhost:5436` hosts both. `infrastructure/docker/postgres-init/01-create-databases.sh`
creates them on first boot; `POSTGRES_DB` is `ffos_dev`, so nothing is ever named plain
`ffos` again — the name now states which environment it is, which is also what the reset
guard relies on.

Redis is separated by logical database: the application uses `0`, the suite uses `1` with
queue prefix `test`, so a running worker and a queue test cannot see each other's jobs.

`.env.test` holds the whole test environment and is the only place the suite reads it from:

```
NODE_ENV=test
DATABASE_URL=postgresql://ffos:ffos@localhost:5436/ffos_test
REDIS_URL=redis://localhost:6379/1
FFOS_QUEUE_PREFIX=test
DEMO_AS_OF_DATE=2026-08-01
DEMO_RANDOM_SEED=family-financial-os-demo-v1
FFOS_ALLOW_DB_RESET=true
```

`FFOS_ALLOW_DB_RESET=true` is safe here because it only unlocks the guard; the guard still
refuses every target that is not disposable (see
[`docs/safety/DATABASE_RESET_GUARD.md`](../safety/DATABASE_RESET_GUARD.md)).

---

## Commands

| Command | Runs |
|---|---|
| `pnpm test` | the full required suite: unit packages **and** the database-backed API suite |
| `pnpm test:unit` | pure packages only (`domain`, `utils`, `schemas`, `financial-engine`) |
| `pnpm test:integration`, `pnpm test:db` | the database-backed API suite only |
| `pnpm test -- --fresh` | as `pnpm test`, dropping the test schema first |
| `pnpm test -- --no-seed` | as `pnpm test`, keeping existing rows |
| `pnpm test:e2e` | Playwright, desktop + mobile, against the running dev stack |
| `pnpm test:e2e:docker` | the same in the pinned Playwright image |

`pnpm test` is `node scripts/run-tests.mjs`, not a turbo task, because the honesty
requirements are sequencing requirements: load `.env.test`, verify the target is a test
database, build, migrate, seed, run, then prove that DB-backed tests executed. It:

1. **loads `.env.test`** and fails if the file is missing — a suite that does not know
   where its database is must not guess;
2. **refuses to start** unless the database name ends in `_test`;
3. **builds** the workspace first, so the API suite cannot test a stale engine `dist`;
4. **migrates and reseeds** the test database every run, so yesterday's leftovers cannot
   change what a test reads;
5. **runs each package suite** with the environment passed through explicitly;
6. **counts the database-backed tests that executed** and fails below a floor.

Turbo's `test` task also now declares its env allowlist and `cache: false`, so an invocation
through turbo cannot repeat the RT2-005 failure either.

---

## How a green result is proven

Three independent mechanisms, because any single one can be defeated:

**Loud fixtures.** `requireTestDatabase()` (`apps/api/src/testing/require-test-database.ts`)
replaced every `if (!process.env.DATABASE_URL) return;`. It throws when `DATABASE_URL` is
absent, and also when it points at a development or unrecognised database, so a
misconfigured shell cannot have the suite mutate real development data.
`requireTestRedis()` does the same for the queue tests and additionally rejects logical
database `0`.

**Loud fixture data.** `assertFixture()` and the `requireDemoHousehold()` /
`requireDemoVehicle()` / `requireDemoAccount()` helpers
(`apps/api/src/testing/demo-fixture.ts`) replaced the `if (!household) return;` pattern.
Renaming the demo household used to produce 129 passes; it now produces failures that name
the missing fixture.

**Execution proof.** Each entry into a database-backed test appends a line to
`FFOS_TEST_EXECUTION_LOG` (the node test runner gives each file its own process, so an
in-memory counter could not see the whole suite). The runner asserts afterwards that at
least `MIN_DATABASE_BACKED_TESTS` (60) executed and prints the count. A count is proof that
guarded bodies ran; duration is not, because a suite can be fast for the wrong reason.

Current run:

```
▶ @ffos/domain             4 tests
▶ @ffos/utils              1 test
▶ @ffos/schemas           16 tests
▶ @ffos/financial-engine 101 tests
▶ @ffos/api              155 tests
▶ Database-backed tests executed: 106
✔ All required suites ran and passed.

277 tests, 0 failed, 0 skipped
Playwright: 63 tests, 53 executed per run, 10 skipped by viewport
```

The 10 Playwright skips are mobile-only specs in the desktop project and desktop-only specs
in the mobile project. Every test executes in the project it targets.

---

## Concurrency and isolation

The API suite runs **serially** (`--test-concurrency=1`). Twelve-way concurrency against
one shared demo household was the source of the unexplained one-off failure recorded in the
earlier investigation, and serial execution is the simplest thing that reliably removes it.
The suite takes about six minutes, which is an acceptable price for a result that means
something.

Isolation strategy, in order of preference:

1. **Own database.** The dev stack cannot reach `ffos_test` at all, so an open dashboard
   rewriting `metric_snapshots` — the specific interference found earlier — is impossible.
2. **Own fixtures.** Tests that mutate create their own household
   (`Oracle ${Date.now()}`, `R2 Truth ${Date.now()}`, …). Only read-only assertions use the
   shared demo household.
3. **Fresh seed per run.** Reseeding makes the shared fixture deterministic regardless of
   what a previous run did.
4. **Serialisation** where the above still leaves a shared surface.

### Evidence

Five consecutive full `pnpm test` runs with the development stack (API, worker, web,
Postgres, Redis) up — three of them back to back while Playwright drove the development
database and the reproduction scripts wrote to it — produced **0 failures and 0 shared-state
contention failures**, with identical counts (155 API tests, 106 database-backed) every run.
Identical counts matter as much as the zero: a suite that silently ran less would still be
green. This demonstrates isolation; it does not prove the absence of flakiness, which no
finite number of runs can.

---

## Adding a test

- Database-backed: call `requireTestDatabase()` first. Do not guard on
  `process.env.DATABASE_URL`.
- Needs a fixture: use `requireDemoHousehold()` / `requireDemoVehicle()` /
  `requireDemoAccount()`, or `assertFixture(value, "what")`. Never `if (!x) return;`.
- Mutates data: create your own household.
- Needs Redis: call `requireTestRedis()` and build the queue with `queueOptions()` from
  `apps/api/src/jobs/redis-connection.ts` so the prefix stays test-scoped.
- Raise `MIN_DATABASE_BACKED_TESTS` in `scripts/run-tests.mjs` as the suite grows, so a
  silent drop stays detectable.
