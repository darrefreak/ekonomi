# Test Environment Isolation

**Date:** 2026-08-08
**Written during:** V1 Red Team re-acceptance (post-remediation)
**Trigger:** During the PR #47 remediation one database-backed API test failed once
while the running application stack refreshed caches against the same development
database, then passed five consecutive reruns. The failing test name was not captured.
The re-acceptance brief required this to be explicitly evaluated rather than assumed
harmless.
**Related finding:** RT2-005 (HIGH) in `V1_RED_TEAM_REACCEPTANCE_FINDINGS.md`
**Scope:** investigation and documentation only. No isolation fix was implemented.

---

## Summary

The one-off failure is real and reproducible at a low rate. It is **not** evidence of a
product financial defect: the ledger truth checks, the invariant suites and the
independent adversarial probes all agree, and the failure never recurred with the
application stack stopped.

The investigation into *why* it was hard to pin down uncovered something considerably
worse than the flake, and it is the most important sentence in this document:

> **`pnpm test` does not run any database-backed test at all.** Turbo 2.10.8 runs tasks
> in `strict` env mode with an empty allowlist for the `test` task, so `DATABASE_URL` is
> stripped before the suite starts. All 129 guards of the form
> `if (!process.env.DATABASE_URL) return;` fire, and the suite reports **127 pass, 2
> skipped in 2.2 seconds**. Invoked directly with the variable exported, the same suite
> takes **33.4 seconds** and reports **129 pass**. The 15× difference is the financial
> assertions not executing.

Five weaknesses compound, in descending order of how badly they mislead a reader.

1. **Turbo strips the database URL.** Every "Tests: PASS" in this repository obtained via
   `pnpm test` — including with `TURBO_FORCE=true` — is a pass of the pure-function tests
   only.
2. **The turbo cache then replays even that.** The `test` task has no `cache: false` and
   no input covering database state, so an unchanged repository reports
   `18 cached, 12ms >>> FULL TURBO`.
3. The suite has **no database of its own**. When the variable *is* exported, it points at
   the same `ffos` database the running Docker application, worker and E2E suite mutate.
4. The application **writes to the tables the tests assert on** during an ordinary
   authenticated read.
5. All 36 test files run **12-way concurrently against one shared mutable household**
   (`Familjen Demo`), with no per-test isolation and no rollback; and **129 fixture
   guards** convert any missing fixture into a pass.

Classification: **TEST_ENVIRONMENT_GAP**, compounded by **SHARED_STATE_TEST_DEFECT**.
See [Classification](#classification) for why both apply and why
`FLAKY_PRODUCT_BEHAVIOR` was rejected.

---

## Current test topology

### Does `pnpm test` use the same PostgreSQL database as the running Docker application?

**No — through `pnpm test` it reaches no database at all. Invoked directly it reaches the
application's database, by ambient inheritance rather than configuration.**

Both halves of that answer are problems, so both are documented.

#### Through `pnpm test`: no database

Turbo 2.10.8 defaults to `envMode: strict`, and the `test` task declares no `env` and no
`passThroughEnv`:

```20:22:turbo.json
    "test": {
      "dependsOn": ["^build"]
    },
```

`turbo run test --filter=@ffos/api --dry=json` confirms what the task actually receives:

```
envMode: strict
task envMode: strict
configured: []
inferred: []
passthrough: None
```

An empty allowlist means `DATABASE_URL` and `REDIS_URL` are removed from the task
environment. The result, with the cache forced off:

```
@ffos/api:test: # pass 127
@ffos/api:test: # fail 0
@ffos/api:test: # skipped 2
@ffos/api:test: # duration_ms 2223.899431

 Tasks:    18 successful, 18 total
Cached:    0 cached, 18 total
```

Compare the same script invoked directly from `apps/api` with the variable exported:

```
# tests 129
# pass 129
# fail 0
# skipped 0
# duration_ms 33377.663191
```

2.2 s versus 33.4 s, and 2 skipped versus 0. Nothing errors and nothing is reported as
skipped, because the guards return quietly. `pnpm test` is green on a suite whose
financial assertions never ran.

#### Invoked directly: the application's own database

`pnpm test` is `turbo run test`, which for the API package is:

```7:7:apps/api/package.json
"test": "tsx --test src/dashboard/dashboard.service.test.ts ... src/vehicles/vehicles.create.test.ts",
```

There is no `--env-file`, no test setup file, and `rg dotenv apps/api/src` returns
nothing: the API sources never load a `.env`. The connection string comes straight from
the ambient process environment:

```26:33:apps/api/src/db/client.ts
export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is required");
    }
    pool = new Pool({ connectionString: url });
  }
  return pool;
}
```

In this workspace that value is `postgresql://ffos:ffos@localhost:5436/ffos` — the same
database `docker-compose.yml` publishes on host port 5436 and the same one the `api`,
`worker` and `web` containers use. `docker ps` during this audit confirmed
`ekonomi-api-1`, `ekonomi-worker-1`, `ekonomi-web-1` and `ekonomi-postgres-1` all up
against it.

There is no `ffos_test` database, no `TEST_DATABASE_URL`, and no test-only compose
service. `.env.example` documents exactly one database URL.

### Can the API or worker concurrently mutate or cache-refresh the same database during tests?

**Yes, on an ordinary `GET`.** `GET /metrics/snapshots` is a read-modify-write:

```250:256:apps/api/src/metrics/metric-registry.service.ts
  async getSnapshots(
    householdId: string,
    currency: CurrencyCode,
    asOf: string,
  ) {
    return this.materializeSnapshots(householdId, currency, asOf);
  }
```

`materializeSnapshots` computes the metric bundle and then, per metric, selects the
existing row and either updates it or inserts a new one — roughly twenty
`metric_snapshots` rows per call, outside a transaction. `metric_snapshots` is precisely
what `metric-registry.consistency.test.ts` and `r4-metric-registry.test.ts` assert on,
for the same household.

Anyone with the web app open on the dashboard, or any polling client, therefore rewrites
the rows under the tests. The worker reaches the same code from
`apps/api/src/jobs/handlers.ts:122`, so an enqueued metric job does too. Jobs are
enqueued by financial mutations; there is no cron, so the worker is quiet unless
something writes.

The E2E suites are a louder version of the same problem: `test:e2e` and
`test:e2e:docker` create households, accounts, transactions and vehicles in this same
database. Running E2E and `pnpm test` concurrently is unsafe by construction.

### Do tests share one mutable household or database state?

**Yes.** The suites resolve the seeded household by name and mutate it in place. There
is no per-test household, no per-test schema and no transaction rollback. Tests that
create transactions, accounts, vehicles, plans and decisions leave those rows behind for
every subsequent file and every subsequent run.

The seed's `Familjen Demo` is also the fixture the audit's own probes and the E2E suites
use, so the same rows are contended by three different consumers.

### Are tests run concurrently against shared rows?

**Yes.** `tsx --test` with 36 file arguments uses the Node test runner, which by default
runs test *files* in parallel up to `os.availableParallelism()` — 12 on this machine. So
up to 12 processes mutate and assert against one household simultaneously, plus the
application, plus the worker.

Node's default parallelism also means the effective concurrency is machine-dependent:
the same suite is a different test on a 4-core CI runner than on this 12-core host.

### Does Redis or the background worker interact with the test database?

**Yes, and Redis is shared too.** `REDIS_URL=redis://localhost:6379` is the same
instance and the same logical database (`0`) that `ekonomi-api-1` and
`ekonomi-worker-1` use. There is no separate Redis database index for tests.
`jobs.integration.test.ts` enqueues against it, and the running worker is a live
consumer of that queue — a job enqueued by a test can be executed by the production-mode
worker container, which then writes to the same tables.

### The turbo cache hides even the truncated run

The same missing `test` task configuration also means no `cache: false` and no `inputs`
covering database state. A second `pnpm test` with no source change replays the previous
result without starting a process at all:

```
Tasks: 18 successful, 18 total
Cached: 18 cached, 18 total
Time: 12ms >>> FULL TURBO
```

So there are two layers to see through. `TURBO_FORCE=true` defeats the cache but not the
strict env mode, so it still only runs the pure-function tests. Only invoking the package
script directly, with `DATABASE_URL` exported, executes the database-backed suite. Every
database-backed result quoted in this acceptance run was obtained that way; the
`TURBO_FORCE=true pnpm test` gate result is reported for what it is, a 2.2-second
pure-function pass.

---

## Reproduction

Deliberate reproduction of the contention, per re-acceptance brief §16. Every run invoked
the package script directly inside `apps/api`, so the ambient `DATABASE_URL` was present
and the database-backed tests actually executed — confirmed by the ~33 s duration and
`129 pass / 0 skipped`. File parallelism was the default 12-way, matching the normal test
command. 19 runs total.

| Arm | Stack | Extra load | Runs | Failures |
|---|---|---|---|---|
| **A** | `ekonomi-api-1` and `ekonomi-worker-1` stopped; Postgres and Redis up | none | 4 | **0** |
| **B** | full stack up (api, worker, web) | none | 12 | **1** |
| **C** | full stack up | 6 threads polling `/metrics/snapshots`, `/dashboard`, `/net-worth` for 45 s per run | 3 | **0** |

### Arm B failure

The failure occurred on the first run of arm B:

```
# tests 129
# suites 0
# pass 128
# fail 1
# cancelled 0
# skipped 0
# duration_ms 33377.663191
```

The eleven subsequent arm-B runs and all arm-A and arm-C runs reported
`# pass 129 # fail 0`. Observed failure rate with the stack up: **1 in 12**. With the
application and worker stopped: **0 in 4**.

The failing test's name was not captured on that run — the same gap as the original
observation, because the run's `not ok` line scrolled past the captured tail. Every
later run was captured in full; none failed again. This is recorded as a limitation
rather than papered over: the specific assertion remains unidentified, and this document
does not claim to know which one it was.

### Arm C did not amplify it

Arm C was intended to force the collision. It did not, for a mundane reason: the API
throttles at 120 requests per minute per client, so the load generator was rejected
`429` on the overwhelming majority of attempts. Each 45 s window landed only ~360
successful requests — still roughly 7 000 `metric_snapshots` upserts against the
household the tests assert on, but far short of saturation. Driving harder would require
bypassing the throttle, which would no longer be a faithful reproduction of application
behaviour.

So the reproduction establishes the failure is real and correlated with the running
stack, and it establishes the mechanism structurally. It does **not** produce an
on-demand deterministic repro.

### Fixture-absence probe

A separate probe measured what the suite detects when it *is* running for real. The
seeded household was renamed to `Familjen Demo RENAMED` so no test could find its
fixture, and the suite was invoked directly with `DATABASE_URL` exported — the 33-second
path, not the truncated turbo path:

```
# tests 129
# pass 129
# fail 0
# skipped 0
# duration_ms 33318.949171
```

The 33-second duration confirms the tests did connect and did run; they simply could not
find their subject and returned.

**The suite reports a complete pass with its subject unreachable.** The cause is 129
top-level guards of the form `if (!household) return;` across 32 of the 36 test files:

| File | Guards |
|---|---|
| `src/ledger/rt-blocker-high.test.ts` | 15 |
| `src/households/p1-u1-workflows.test.ts` | 8 |
| `src/ledger/r3-financial-runtime.test.ts` | 7 |
| `src/ledger/r1-atomicity-idempotency.test.ts` | 7 |
| `src/ledger/ledger-invariants.test.ts` | 7 |
| `src/wealth/wealth.service.test.ts` | 6 |
| `src/vehicle-intel/p1-u6-vehicle-intel.test.ts` | 6 |
| `src/jobs/jobs.integration.test.ts` | 6 |
| 24 further files | 1–5 each |
| **Total** | **129** |

Guarded conditions include `!process.env.DATABASE_URL`, `!household`, `!ctx`, `!fx`,
`!inv` and `!periodRow`. `jobs.integration.test.ts` additionally calls `t.skip` when
`REDIS_URL` is unset. Every one of these turns a missing precondition into a green test.

The household was restored afterwards; `git status` is clean.

---

## Classification

**TEST_ENVIRONMENT_GAP** — primary. The suite has no isolated database, no isolated
Redis, no protection from the running application, and a cache that will replay a pass
without executing anything.

**SHARED_STATE_TEST_DEFECT** — also present, independently of the environment. One
mutable household shared by 12 parallel processes with no rollback is a defect in the
tests themselves; it would remain after giving the suite its own database.

**FLAKY_PRODUCT_BEHAVIOR** — rejected, on evidence rather than convenience:

- 0 failures in 4 runs with the application and worker stopped, against the same
  database, the same data and the same parallelism.
- The ledger invariant sweep found 0 unbalanced entries, 0 orphan postings, 0
  cross-household postings and 0 events without an entry, including after replicating
  the ledger to 2.7 M postings.
- The independent adversarial probes (idempotency, `asOf`, net worth history, isolation)
  are deterministic and repeated; none showed intermittency.
- The two blockers this audit *did* find (RT2-001, RT2-002) are perfectly deterministic.

The honest position: intermittency under concurrent load has not been *excluded* as a
product property, because the specific failing assertion was never identified. It is
merely unsupported by every other measurement. Per brief §33 this is reported as an
operational and testing limitation, not a product financial failure.

**Effect on this acceptance run.** The re-acceptance verdict is FAIL for reasons wholly
unrelated to test isolation — two new blockers found by independent probes that do not
use the test suite at all. So the gap did not decide the verdict. Had the product been
otherwise clean, this gap alone would have capped the result at CONDITIONAL PASS under
§33, because a suite that passes 129/129 with its fixture renamed cannot be the primary
evidence for financial correctness.

---

## Production data separation

Per brief §18, verified against configuration.

| Requirement | Status | Evidence |
|---|---|---|
| Distinct development / test / production databases are *possible* | **Yes** | Everything reads a single `DATABASE_URL`, so pointing each environment at its own database is a deployment concern only. |
| A test database exists and is explicitly named | **No** | One `ffos` database. No `ffos_test`, no `TEST_DATABASE_URL`, no test compose service. |
| A test command cannot target production by default | **No — this is the serious part** | `pnpm test` and `pnpm db:reset` both act on whatever `DATABASE_URL` the shell exports. Nothing distinguishes a test invocation from a production one. |
| Environment identity is obvious from secrets and URLs | **Partially** | The `ffos:ffos@localhost:5436/ffos` dev URL is recognisable, but nothing in the code asserts it. `NODE_ENV=development` is not consulted by any database entrypoint. |

The sharpest edge is `db:reset`, filed separately as RT2-006 (HIGH):

```3:9:apps/api/src/db/reset.ts
async function main() {
  const pool = getPool();
  console.log("Resetting public + drizzle schemas...");
  // Must drop drizzle journal too; otherwise migrate is a no-op on an empty public schema.
  await pool.query(
    "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;",
  );
```

`pnpm db:reset` drops every table in whatever database `DATABASE_URL` names. There is no
environment check, no database-name check, no `--force` flag and no confirmation prompt.
A pilot operator with a production `DATABASE_URL` exported — the natural state for
running a migration — destroys the pilot's data with a command whose name suggests a
development convenience. `db:seed` is milder but likewise unguarded: it will write demo
data into any database.

---

## Recommended fixes

Post-acceptance, per brief §19. Not implemented during this audit. Ordered by ratio of
risk removed to work required.

1. **Make `pnpm test` actually run the tests.** Give the `test` task the environment it
   needs and stop caching it:

```json
"test": {
  "dependsOn": ["^build"],
  "cache": false,
  "env": ["DATABASE_URL", "REDIS_URL", "NODE_ENV"]
}
```

   Six lines in `turbo.json`. Nothing else on this list matters until this lands, because
   until it does the suite is not evidence of anything. Expect it to go red on first
   attempt — that is the point.

2. **Delete the vacuous guards.** Replace all 129 `if (!household) return;` and
   `if (!process.env.DATABASE_URL) return;` guards with a hard failure. A shared
   `requireFixture()` helper that throws is enough. This is what makes item 1
   self-enforcing: with the guards gone, a stripped environment fails loudly instead of
   passing in 2.2 seconds, and the original one-off failure would have been captured with
   a name attached.

3. **Guard the destructive entrypoints.** In `reset.ts` and `seed.ts`, refuse to run
   unless the target database name matches an expected development or test pattern, or an
   explicit `FFOS_ALLOW_DESTRUCTIVE=1` is set. This closes RT2-006 and is a few lines in
   two files. Independent of the rest, and worth landing at the same time as item 1.

4. **Give the suite its own database.** Add an `ffos_test` database and a
   `TEST_DATABASE_URL`, and have the test entrypoint require it and refuse to run against
   the development URL. That single requirement also removes the application and worker as
   contenders, because they never point at `ffos_test`.

5. **Isolate per test.** Either a unique household per test file (a fixture factory
   rather than a seed lookup), or a per-file schema, or wrap each test in a transaction
   that rolls back. The household factory is the most compatible with the current suites
   and also removes the 12-way shared-row contention that item 4 does not address.

6. **Separate Redis.** A distinct Redis logical database (`redis://localhost:6379/1`) or
   instance for tests, so an enqueued test job can never be executed by the running
   worker.

7. **Disable the worker during deterministic API tests.** Once items 4 and 6 are in
   place this is mostly redundant, but it is cheap insurance and makes intent explicit.

8. **Pin test parallelism.** Pass an explicit `--test-concurrency` so the suite behaves
   the same on a 4-core CI runner as on a 12-core workstation, rather than being a
   different test on every machine.

Items 1 and 3 are small enough to land immediately and remove the two ways this
environment can mislead an operator: a green suite that ran nothing, and a reset command
that can drop a pilot database. Items 2, 4 and 5 are what turn the suite into trustworthy
acceptance evidence.
