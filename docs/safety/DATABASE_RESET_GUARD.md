# Database reset guard

**Status:** in force
**Introduced by:** RT2 critical remediation
**Reason:** RT2-006
**Code:** `apps/api/src/db/reset-guard.ts`, `apps/api/src/db/database-target.ts`
**Tests:** `apps/api/src/db/reset-guard.test.ts`

---

## What was wrong

`pnpm db:reset` executed

```sql
DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;
```

against whatever `DATABASE_URL` happened to be set to, with no environment check, no name
allow-list, no confirmation and no dry run. Pointed at a pilot or production database — one
stale shell variable away — it destroyed the data and exited zero. Before real household
financial data exists, this must be impossible by accident.

The cost of being wrong is asymmetric: refusing a legitimate reset costs a rename, running
one against real data costs the data. Everything below follows from that.

---

## The four conditions

All four must hold. No single mistake — a stale variable, a copied command, the wrong
`.env` — is enough.

| # | Condition | Rationale |
|---|---|---|
| 1 | `NODE_ENV` is not `production` | checked first, before the URL is even parsed |
| 2 | the target parses and **names itself disposable**: `*_dev` or `*_test` | naming is the contract; anything else is potentially real data |
| 3 | `FFOS_ALLOW_DB_RESET=true` | no ambient environment sets this; it must be a deliberate act |
| 4 | a **development** database additionally needs the operator to name it: `FFOS_DB_RESET_CONFIRM=<database>` or `--yes` | a test database is disposable by definition, so CI stays non-interactive |

Refusal is loud and specific: it names the target, the classification and what would have
to be true to proceed.

## Classification

`describeDatabaseTarget()` parses the URL and classifies it. Unrecognised is treated as
potentially real:

| Kind | Recognised by | Reset |
|---|---|---|
| `test` | database name ends in `_test` | allowed with condition 3 |
| `development` | database name ends in `_dev` | allowed with conditions 3 and 4 |
| `protected` | `prod`, `production`, `staging`, `stage`, `live`, `pilot` or `customer` **anywhere in the database name or the host** | never |
| `unknown` | anything else, including a missing or malformed URL | never |

A protected marker wins over a disposable suffix: `prod_test` is refused. A protected
**host** wins over a disposable name: `ffos_test` at `db.production.internal` is refused.

## Non-interactive CI

There are no prompts, so nothing can hang a pipeline. A test database with
`FFOS_ALLOW_DB_RESET=true` resets without interaction, which is exactly what
`.env.test` and `scripts/run-tests.mjs --fresh` rely on. Everything else needs the extra
confirmation, and prompt-free refusal is the default.

## Credentials never appear in output

`DatabaseTarget.describe()` returns `"<database> at <host>:<port> (<kind>)"` and nothing
else, so a guard message, a log line or a CI transcript cannot leak a password. A test
asserts this directly, using a URL whose password is `hunter2` and checking that neither the
password nor `ffos:` appears in any message the guard can produce.

## Seeding is guarded too

`pnpm db:seed` writes demo data, which would be just as destructive to real data. It
classifies its target the same way and refuses anything that is not `_dev` or `_test`,
printing e.g. `Seeding ffos_dev at localhost:5436 (development)` before it starts.

---

## Verified behaviour

| Scenario | Result |
|---|---|
| `ffos_test`, permission set, `NODE_ENV=test` | allowed, non-interactive |
| `ffos_dev`, permission set, no confirmation | refused, names `FFOS_DB_RESET_CONFIRM=ffos_dev` |
| `ffos_dev`, permission set, `FFOS_DB_RESET_CONFIRM=ffos_dev` or `--yes` | allowed |
| `ffos_dev`, but `FFOS_DB_RESET_CONFIRM=ffos_test` | refused — naming the wrong database is not confirmation |
| `ffos_production`, `ffos_prod`, `ffos_staging`, `ffos_live`, `pilot_data`, `customer_ledger`, `prod_test` | refused, protected pattern |
| `ffos_test` at host `db.production.internal` | refused, protected host |
| `ffos`, `postgres`, `app`, `ffos_devx`, `testing` | refused, unrecognised name |
| `NODE_ENV=production` | refused first, whatever the URL says |
| `FFOS_ALLOW_DB_RESET` unset, `1`, or `yes` | refused — only the literal `true` grants permission |
| `DATABASE_URL` missing, empty, `not a url`, `mysql://…`, or without a database name | refused |
| any refusal or success message | contains host, port, database and kind; never credentials |

Ten unit tests in `apps/api/src/db/reset-guard.test.ts` cover exactly these rows and run in
`pnpm test`.

## Usage

```bash
# Test database (what pnpm test does for you)
FFOS_ALLOW_DB_RESET=true pnpm db:reset

# Development database, explicitly named
DATABASE_URL=postgresql://ffos:ffos@localhost:5436/ffos_dev \
FFOS_ALLOW_DB_RESET=true FFOS_DB_RESET_CONFIRM=ffos_dev pnpm db:reset
```

Reset runs migrations and the seed afterwards, so the database comes back usable rather
than empty.
