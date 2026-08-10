# RT2 Critical Remediation — Reproduction Log

**Date:** 2026-08-08
**Scope:** RT2-001, RT2-002, RT2-003, RT2-004, RT2-005, RT2-006, RT2-008 (RT2-007 evaluated separately)
**Source of findings:** `docs/acceptance/V1_RED_TEAM_REACCEPTANCE_FINDINGS.md`
**Harness:** `scripts/rt2-repro.py` (HTTP + direct SQL), plus per-finding commands recorded below
**Rule followed:** every defect was reproduced against the current code before any fix was designed. Nothing here is taken from the report description alone.

---

## Pre-fix harness result

```
$ python3 scripts/rt2-repro.py
TOTAL 21  PASS 7  FAIL 14
```

The seven passes are the behaviours that already worked and must keep working
(opening net worth, a card purchase, same-key retry collapsing to one event,
provider `externalId` dedup, different-key vehicle create, cross-command-type keys).
The fourteen failures are the defects.

---

## RT2-001 — BLOCKER — liability sign handling

| | |
|---|---|
| **Severity** | BLOCKER (financial correctness) |
| **Surface** | `/net-worth`, `/dashboard`, `/metrics/snapshots`, `/debt`, AI `get_net_worth` |
| **Affected code** | `packages/financial-engine/src/wealth.ts` `bucketBalancesForNetWorth`; `packages/financial-engine/src/debt.ts` `outstandingLiabilityMinor` |
| **Affected consumers** | `apps/api/src/debt/debt.service.ts:95,282`; `apps/api/src/decisions/opportunities-generator.service.ts:131` |
| **Test coverage before fix** | None. Every existing net worth test compares product surfaces to each other or to a fixture whose liabilities are all positive, so the defect is invisible to the whole suite. |

### Original reproduction, clean household, no demo assumptions

```
new household
  CHECKING  opening 100 000,00 kr
  CREDIT_CARD opening 0
1. card purchase    1 000 kr
2. overpay the card 3 000 kr
```

| Step | Cash | Card balance | Expected NW | Actual NW |
|---|---|---|---|---|
| open | 100 000,00 | 0 | 100 000,00 | 100 000,00 ✓ |
| after purchase | 100 000,00 | 1 000,00 owed | 99 000,00 | 99 000,00 ✓ |
| after overpay | 97 000,00 | −2 000,00 (credit) | **99 000,00** | **95 000,00** ✗ |

Harness output:

```
[PASS] RT2-001a clean household opening net worth: net worth 10000000 expected 10000000
[PASS] RT2-001b card purchase reduces net worth by the purchase: net worth 9900000
[FAIL] RT2-001c liability credit balance adds to net worth: card balance -200000 net worth 9500000 expected 9900000
[FAIL] RT2-001d net worth breakdown carries the signed liability position: liabilities component 200000 expected -200000
[FAIL] RT2-001f debt surface shows nothing owed on a credit balance: debt outstanding 200000 expected 0
```

Net worth is wrong by `−4 000` kr, exactly twice the 2 000 kr credit balance: the
credit is subtracted instead of added.

### The shipped demo already triggers it

Expected value computed independently from account positions in SQL
(`Σ non-liability balances − Σ signed liability balances`), never through a
product aggregate:

```
[FAIL] RT2-001e demo net worth equals independently computed positions:
       product 546634232  independent 549834768  delta -3200536
```

`−3 200 536` öre = `−32 005,36 kr`, exactly twice the seeded card balance of
`−1 600 268` öre. The demo card `Kreditkort` carries a credit because the seed's
card payments exceed its card purchases.

### Root cause

The ledger convention is unambiguous and correct:

```23:28:packages/financial-engine/src/ledger/reconstruct.ts
  // Asset/nominal: debit increases, credit decreases.
  // Liability: credit increases owed balance, debit decreases.
  const assetSigned =
    input.side === "debit" ? input.amountMinor : -input.amountMinor;
  if (input.balanceClass === "liability") return -assetSigned;
```

For a liability account a **positive balance means money owed** and a negative
balance means the lender owes the household. Aggregation then discards that sign:

```18:24:packages/financial-engine/src/wealth.ts
  const sumTypes = (types: string[], asLiability: boolean) =>
    rows
      .filter((r) => types.includes(r.accountType))
      .reduce(
        (acc, r) => acc + (asLiability ? absMinor(r.balanceMinor) : r.balanceMinor),
        0n,
      );
```

`calculateNetWorth` subtracts `liabilities`, so a `−X` balance is converted to
`+X` and then subtracted: the error is `2X`. `outstandingLiabilityMinor` in
`debt.ts` has the identical bug and feeds the Debt page, mortgage interest
scenarios and the opportunities generator, so a credit balance also produces
phantom interest.

### Affected database state

No corrupt rows. The ledger, the postings and `accounts.current_balance_minor`
are all correct. This is purely an aggregation defect, which is why no invariant
or balance-reconciliation test detects it.

A related inconsistency the sign bug was masking: 160 `MORTGAGE` accounts hold a
negative `current_balance_minor` and 140 a negative `opening_balance_minor`. All
of them belong to test fixtures — the only product writers (`accounts.create`
and the demo seed) use the positive-owed convention. `absMinor` made the wrong
fixture convention appear to work.

```
 account_type | pos | neg | zero | neg_open
--------------+-----+-----+------+----------
 LOAN         |  82 |   0 |  120 |        0
 CREDIT_CARD  |  40 |   2 |  420 |        0
 MORTGAGE     | 362 | 160 |    0 |      140
```

---

## RT2-002 — BLOCKER — `POST /accounts` and `POST /vehicles` ignore `Idempotency-Key`

| | |
|---|---|
| **Severity** | BLOCKER (duplicate economic effect) |
| **Surface** | `POST /accounts`, `POST /vehicles`, and the web forms that call them |
| **Affected code** | `apps/api/src/accounts/accounts.service.ts:107`; `apps/api/src/vehicles/vehicles.service.ts:105`; neither controller reads the header |
| **Affected database state** | Duplicate `accounts`, `account_balance_snapshots`, `vehicles`, `vehicle_ownerships`, `vehicle_usage_profiles`, `vehicle_finance_agreements`, `vehicle_odometer_readings` rows |
| **Test coverage before fix** | None. `accounts.mutations.test.ts` and `vehicles.create.test.ts` never retry a command. |

### Reproduction

```
[FAIL] RT2-002a account create identical retry yields one account:
       statuses 201/201 rows 2 ids 72949adb-… vs 792a837e-…
[FAIL] RT2-002c account same key + changed payload conflicts: status 201 code None
[FAIL] RT2-002d account concurrent same-key retry yields one account:
       statuses [201 ×8] rows 8
[FAIL] RT2-002e vehicle create identical retry yields one aggregate:
       statuses 201/201 vehicles 2 asset accounts 2 loan accounts 2
[FAIL] RT2-002f vehicle retry does not inflate net worth: delta 18000000 expected 9000000
[FAIL] RT2-002g vehicle same key + changed payload conflicts: status 201 code None
```

Eight concurrent requests carrying one `Idempotency-Key` produced **eight**
accounts. One retried vehicle create produced two vehicles, two asset accounts
and two loan accounts, and moved net worth by `+18 000 000` öre instead of
`+9 000 000`.

### Root cause

Neither endpoint has any idempotency mechanism. The header is accepted by the
HTTP layer and discarded. The existing `financial_command_idempotency` table is
reachable only from `persistBalancedEvent`, so it protects ledger commands and
nothing else. Both services also write their rows as a sequence of independent
statements with no enclosing transaction, so a partial failure leaves an
orphaned aggregate.

`packages/api-client/src/client.ts` sends an `Idempotency-Key` on both calls, so
the request looks protected from the client's side. Only the disabled submit
button prevents the duplicate, which a flaky connection or a retrying proxy
defeats.

---

## RT2-003 — HIGH — synthetic natural-key `externalId` refuses a genuinely new command

| | |
|---|---|
| **Severity** | HIGH (legitimate financial action refused and never recorded) |
| **Surface** | `POST /ledger/transfers/internal`, `/ledger/credit-card/payment`, `/ledger/assets/purchase`, `/ledger/assets/financed-purchase`, `/ledger/assets/depreciation` |
| **Affected code** | `apps/api/src/ledger/economic-events.service.ts:195, 286, 529, 577, 741` |
| **Affected database state** | The unique index `source_tx_household_external` on `source_transactions (household_id, account_id, external_id)` |
| **Test coverage before fix** | None. Every idempotency test retries the *same* command; none issues two legitimate same-shape commands. |

### Reproduction

```
[FAIL] RT2-003a two same-shape transfers with different keys are both recorded:
       statuses 201/409 events 1
[FAIL] RT2-003b two same-shape card payments with different keys are both recorded:
       statuses 201/409 events 1
```

Two transfers of 10 000 kr to the same savings account on the same day, each
carrying its own distinct `Idempotency-Key`, are a normal thing for a household
to do. The second is rejected `409 IDEMPOTENCY_CONFLICT` and never recorded.

### Root cause

Five endpoints synthesise an `externalId` from the economic shape when the
client does not supply one:

```195:197:apps/api/src/ledger/economic-events.service.ts
    const externalId =
      input.externalId ??
      `api-transfer-${input.fromAccountId}-${input.toAccountId}-${input.occurredOn}-${input.amountMinor}`;
```

`resolveCommandKey` correctly prefers the client `Idempotency-Key` over
`externalId`, so the *command* idempotency check passes. The synthetic value is
nevertheless written to `source_transactions.external_id`, which carries a
unique index, so the second insert raises `23505`. `persistBalancedEvent`
interprets any unique violation as a concurrent same-key race, looks for a
matching idempotency record, finds none (the keys differ) and throws
`IdempotencyConflictError`.

Three distinct identities are conflated: the client's *command* identity
(`Idempotency-Key`), the provider's *source record* identity (`externalId`) and
a *business natural key* that the domain does not actually declare. Nothing in
the domain says a household may only make one transfer of a given amount between
two accounts per day.

### Not to be broken by the fix

`RT2-003c` and `RT2-003d` pass today and are regression anchors: a repeated
`Idempotency-Key` must still collapse to one event, and an explicitly supplied
provider `externalId` must still dedupe across different command keys.

---

## RT2-004 — HIGH — mobile 404 false-positive guard is ineffective

| | |
|---|---|
| **Severity** | HIGH (test validity) |
| **Surface** | `e2e/mobile-critical-paths.spec.ts` |
| **Affected code** | `e2e/mobile-critical-paths.spec.ts:33` |
| **Test coverage before fix** | The guard *is* the coverage, and it does not work. |

### Reproduction

The route list was mutated back to the route the original false positive used:

```
["/", "/money", "/more", "/settings", "/review"]
```

`/money` returns HTTP 404:

```
GET /money -> HTTP 404
```

The mobile suite was then run in the pinned Playwright container:

```
$ pnpm test:e2e:docker:mobile
  28 passed (42.5s)
```

### Root cause

```31:33:e2e/mobile-critical-paths.spec.ts
      await expect(page.locator("#main-content")).toBeVisible();
      // A 404 shell also renders #main-content, so assert the real page landed.
      await expect(page.getByRole("heading").first()).toBeVisible();
```

The remediation replaced one shell-only assertion with another. Next.js renders
its not-found page *inside* the application shell, and that page contains its own
headings — `["404", "This page could not be found."]`. `#main-content` is present
and `getByRole("heading").first()` resolves, so both assertions pass. Neither
assertion says anything about *which* page loaded.

---

## RT2-005 — HIGH — `pnpm test` does not run the database-backed tests

| | |
|---|---|
| **Severity** | HIGH (test trust) |
| **Surface** | `pnpm test`, and every acceptance claim resting on it |
| **Affected code** | `turbo.json` `tasks.test`; 129 fixture guards across 32 API test files |
| **Test coverage before fix** | None; no meta-test asserts that the suite executed. |

### Reproduction

Turborepo 2.10.8 defaults to `envMode: strict`, and the task declares no `env`:

```
$ npx turbo run test --filter=@ffos/api --dry=json
envMode: strict
task envMode: strict
configured: []
inferred: []
passthrough: None
```

`DATABASE_URL` is therefore stripped from the task environment. Forced, uncached:

```
$ TURBO_FORCE=true pnpm test
@ffos/api:test: # pass 127
@ffos/api:test: # fail 0
@ffos/api:test: # skipped 2
@ffos/api:test: # duration_ms 2223.899431
 Tasks:    18 successful, 18 total
Cached:    0 cached, 18 total
```

The same script invoked directly with the variable exported:

```
$ cd apps/api && pnpm test
# tests 129
# pass 129
# fail 0
# skipped 0
# duration_ms 33377.663191
```

2.2 s versus 33.4 s. Nothing errors and nothing reports as skipped, because 129
guards of the form `if (!process.env.DATABASE_URL) return;` return quietly.

Unforced, turbo does not start a process at all:

```
Tasks: 18 successful, 18 total
Cached: 18 cached, 18 total
Time: 12ms >>> FULL TURBO
```

### Root cause

Three compounding causes: strict env mode with an empty allowlist; a cacheable
task whose key ignores database state; and fixture guards that turn "the suite
could not run" into a pass. Full topology in
`docs/acceptance/TEST_ENVIRONMENT_ISOLATION.md`.

---

## RT2-006 — HIGH — `pnpm db:reset` destroys whatever `DATABASE_URL` points at

| | |
|---|---|
| **Severity** | HIGH (data loss) |
| **Surface** | `pnpm db:reset`, `pnpm db:seed` |
| **Affected code** | `apps/api/src/db/reset.ts:3-9`, `apps/api/src/db/seed.ts` |
| **Test coverage before fix** | None. |

### Reproduction

A production-like database was created with a row standing in for pilot data:

```sql
create database ffos_production;
create table pilot_household_data(id int primary key, note text);
insert into pilot_household_data values (1, 'real customer money');
```

The reset was then run with every signal that should stop it — `NODE_ENV` set to
`production` and a database literally named `ffos_production`:

```
$ NODE_ENV=production \
  DATABASE_URL=postgresql://ffos:ffos@localhost:5436/ffos_production \
  pnpm db:reset
Resetting public + drizzle schemas...
exit=0

$ psql -d ffos_production -c 'select count(*) from pilot_household_data'
ERROR:  relation "pilot_household_data" does not exist
```

The data is gone and the command exited `0`. The scratch database was dropped
afterwards.

### Root cause

```3:9:apps/api/src/db/reset.ts
async function main() {
  const pool = getPool();
  console.log("Resetting public + drizzle schemas...");
  // Must drop drizzle journal too; otherwise migrate is a no-op on an empty public schema.
  await pool.query(
    "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;",
  );
```

No environment check, no database-name check, no confirmation, no force flag.
`NODE_ENV` is never read by any database entrypoint. `db:seed` is unguarded in
the same way and will write demo data into any reachable database.

---

## RT2-008 — MEDIUM (financial defence) — duplicate balance snapshots can be persisted

| | |
|---|---|
| **Severity** | MEDIUM, but load-bearing for the RT-004 fix |
| **Surface** | Net worth history |
| **Affected code** | `apps/api/src/db/schema-economic.ts:227` (no unique index); `apps/api/src/ledger/ledger-truth.service.ts:156-182`; `apps/api/src/metrics/household-metrics.service.ts:277-305` |
| **Test coverage before fix** | Read-side only: `rt-blocker-high.test.ts` proves the *reader* deduplicates. Nothing prevents the write. |

### Reproduction

```
[FAIL] RT2-008a duplicate (account, as_of, source) snapshot is rejected:
       second identical snapshot inserted
[FAIL] RT2-008b no duplicate snapshot groups remain in the database:
       duplicate groups 113
```

Two byte-identical rows for the same account, the same instant and the same
source insert without complaint, and the development database already holds 113
such groups.

### Root cause and correct granularity

`account_balance_snapshots` has no unique index at all. Both writers use
delete-then-insert outside a transaction:

```156:167:apps/api/src/ledger/ledger-truth.service.ts
      // Replace same calendar-day reconcile snapshot for idempotency.
      await db
        .delete(accountBalanceSnapshots)
        .where(
          and(
            eq(accountBalanceSnapshots.householdId, householdId),
            eq(accountBalanceSnapshots.accountId, row.accountId),
            eq(accountBalanceSnapshots.source, "ledger_reconcile"),
            sql`(${accountBalanceSnapshots.asOf} AT TIME ZONE 'UTC')::date = ${asOf}::date`,
          ),
        );
```

Two concurrent runs both delete, then both insert. The observed duplicates are
all `source = 'ledger_reconcile'`, matching that race exactly.

Uniqueness on `(account_id, as_of)` alone would be **wrong**: several sources
legitimately describe the same account on the same day, and the reader
deliberately ranks them (`nw_history_reconstruct` > `ledger_reconcile` >
`ledger_reconstruct` > other). The domain granularity is *one authoritative
snapshot per account, per instant, per source*, so the constraint belongs on
`(account_id, as_of, source)`.

Current writers and their `as_of` conventions:

| Source | Writer | `as_of` |
|---|---|---|
| `ledger_reconcile` | `ledger-truth.service.ts` | `${date}T12:00:00Z` |
| `nw_history_reconstruct` | `household-metrics.service.ts` | `${date}T12:00:00Z` |
| `ledger_reconstruct` | seed / tests | `${date}T12:00:00Z` |
| `manual_opening` | `accounts.service.ts` | `new Date()` — arbitrary wall-clock instant |

`manual_opening` is the odd one out and must be normalised to the same
convention, otherwise a retried account create produces two opening snapshots at
two different instants and the constraint cannot see them as duplicates.

### Migration hazard

113 duplicate groups exist today, so the constraint cannot simply be added. The
migration must resolve them by a documented rule rather than deleting rows
arbitrarily.

---

## RT2-007 — dependency advisory (evaluated, not reproduced)

Evaluated separately in `docs/remediation/RT2_CRITICAL_REPORT.md`. The advisory
concerns a `drizzle-orm` code path this application does not use; the question
for remediation is whether the patched release is a safe upgrade here, not
whether the defect is reachable.
