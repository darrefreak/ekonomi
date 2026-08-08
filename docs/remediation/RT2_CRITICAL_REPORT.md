# RT2 Critical Remediation — Report

**Date:** 2026-08-08
**Scope:** the BLOCKER and HIGH findings from the V1 Red Team re-acceptance, plus the two
MEDIUM items explicitly included in the brief (RT2-007, RT2-008)
**Findings source:** [`docs/acceptance/V1_RED_TEAM_REACCEPTANCE_FINDINGS.md`](../acceptance/V1_RED_TEAM_REACCEPTANCE_FINDINGS.md)
**Reproductions:** [`docs/remediation/RT2_CRITICAL_REPRO.md`](./RT2_CRITICAL_REPRO.md)
**Out of scope by instruction:** product features, Medium/Low UX polish, real integrations,
the real-data pilot

---

## Result

| ID | Severity | Title | Status |
|---|---|---|---|
| RT2-001 | BLOCKER | Liability credit balance misstates net worth and debt | **FIXED** |
| RT2-002 | BLOCKER | `POST /accounts` and `POST /vehicles` ignore `Idempotency-Key` | **FIXED** |
| RT2-003 | HIGH | A genuinely new same-shape command refused `409` | **FIXED** |
| RT2-004 | HIGH | Mobile 404 false positive still possible | **FIXED** |
| RT2-005 | HIGH | `pnpm test` runs no database-backed test | **FIXED** |
| RT2-006 | HIGH | `pnpm db:reset` can drop any database | **FIXED** |
| RT2-007 | MEDIUM | `drizzle-orm` SQL-injection advisory | **RESOLVED** (upgraded) |
| RT2-008 | MEDIUM | No unique constraint on balance snapshots | **FIXED** (domain-correct key) |
| RT2-009, RT2-010 | LOW | Aggregate scaling; untranslated 404 copy | OPEN, out of scope |

One defect was found *by* this remediation and fixed with it: current positions ignored the
requested `asOf`, so `/net-worth` disagreed with its own history series as soon as any event
was booked after the demo freeze. That was the residue of original finding RT-004; see
[As-of positions](#as-of-positions-found-during-this-remediation).

Independent verification, all against the running stack and direct SQL:

```
python3 scripts/rt-repro.py           TOTAL 13  PASS 13  FAIL 0   (original findings)
python3 scripts/rt2-repro.py          TOTAL 21  PASS 21  FAIL 0   (RT2 findings)
python3 scripts/financial-oracle.py   TOTAL 15  PASS 15  FAIL 0   (independent oracle)
pnpm test                             277 tests, 0 failed, 0 skipped, 106 DB-backed executed
pnpm test:e2e:docker                  53 passed, 10 skipped by viewport, 0 failed
```

---

## RT2-001 — liability sign semantics

### What was wrong

`bucketBalancesForNetWorth` applied `absMinor` to liability balances, and
`outstandingLiabilityMinor` did the same for the debt surface. A liability holding a credit
balance — an overpaid card, a refund landing after the statement was paid, an import that
orders a payment before its purchases — was therefore counted as debt of the same magnitude
instead of as an asset-like position. The error is exactly twice the credit, because the
credit is subtracted where it should be added.

The shipped demo already carried it: the seeded card stands at `−1 600 268` öre, so net
worth was understated by `−3 200 536` öre = `−32 005,36 kr`, and all five surfaces agreed on
the wrong number.

### The canonical convention

One rule now governs every stored balance, documented in
`packages/financial-engine/src/account-sign.ts` and in
[`docs/DOMAIN_INVARIANTS.md` §1b](../DOMAIN_INVARIANTS.md):

> A balance is the account's **signed economic position from the household's point of
> view**, expressed in the account's own natural direction.

| Class | Types | `+32 005,36` | `−32 005,36` |
|---|---|---|---|
| Asset | `CHECKING` `SAVINGS` `CASH` `INVESTMENT` `PENSION` `CRYPTO` `ASSET` | the household holds it | overdrawn |
| Liability | `MORTGAGE` `LOAN` `CREDIT_CARD` | the household **owes** it | the lender owes the household — a real, ordinary position |
| Nominal | `EXPENSE` `INCOME` | never on the balance sheet | — |

This is exactly what `postingBalanceDelta` already produced, so the ledger needed no change:
on a liability a credit increases the owed balance and a debit decreases it, which is why a
principal payment moves the balance toward and possibly past zero.

```
netWorth = Σ asset-class − Σ liability-class        (no absolute values anywhere)
```

A 1 000 kr principal payment from cash moves cash −1 000 and the liability −1 000, so net
worth is unchanged. 100 kr of interest moves cash −100 with no liability movement, so net
worth falls 100. Both fall out of the identity; neither needs a special case.

**Presentation is a separate layer.** `outstandingDebtMinor` clamps at zero rather than
taking an absolute value, because a household with an overpaid card owes nothing — it does
not owe the credit. `liabilityCreditMinor` exposes the credit as its own positive magnitude.
A presentation helper inside an economic aggregation *is* this defect, so the debt surface
now carries `outstanding` (clamped), `credit` and `signedBalance` per account, with
`owed − credit = total`, and the total is the signed position net worth subtracts.

### `absMinor` audit

Every occurrence of `absMinor`, `Math.abs`, manual negation and liability normalisation in
financial code was classified rather than removed mechanically:

| Site | Classification | Action |
|---|---|---|
| `wealth.ts` `bucketBalancesForNetWorth` liability bucket | **FINANCIALLY_UNSAFE** | removed; liabilities now sum signed |
| `debt.ts` `outstandingLiabilityMinor` | **FINANCIALLY_UNSAFE** as used in aggregation | replaced by `outstandingDebtMinor`, which clamps at zero and is documented presentation-only |
| `debt.service.ts` per-account display magnitude | VALID_DISPLAY_NORMALIZATION | kept, with `credit` added so the rows reconcile with the total |
| `net-worth.ts` change/attribution deltas | VALID_DOMAIN_TRANSFORMATION | kept — a magnitude of a *delta*, not of a position |
| `forecast.ts`, `risk.ts`, `opportunities.ts` magnitudes of differences | VALID_DOMAIN_TRANSFORMATION | kept |

One test fixture was also wrong in the same way and was corrected: an API test opened a
mortgage at `−2 000 000,00`, which under the canonical convention means the bank owes the
household two million.

### Verification

- Independent oracle, three levels: arithmetic, ledger, and the running stack. See
  [`docs/testing/FINANCIAL_ORACLE.md`](../testing/FINANCIAL_ORACLE.md).
- **Five surfaces plus the oracle** — dashboard, `/net-worth`, the history series' final
  point, the metric registry, and the AI `get_net_worth` tool — all equal the value
  independently recomputed from positions in SQL (`ORACLE-001…005`): `549 791 368` öre on the
  freshly seeded demo, and still exactly equal after end-to-end runs move the number.
- Liability matrix over the real ledger: mortgage, vehicle loan and credit card; opening,
  purchase, repayment, overpayment, payoff, principal and interest. Principal neutrality is
  proven by holding interest constant and varying the principal ninefold: both payments cost
  exactly the interest.
- `[PASS] RT2-001c/d/f` on a clean household; the credit balance now adds to net worth, the
  breakdown carries the signed position, and the debt row shows nothing owed.

---

## RT2-002 — command idempotency for aggregate creates

### What was wrong

`POST /accounts` and `POST /vehicles` accepted `Idempotency-Key` and ignored it. A retried
vehicle create produced a second vehicle, a second asset account and a second loan account,
inflating net worth by the vehicle's equity; a retried account create duplicated the opening
balance. The web forms already send a key, so the request looked protected while the only
real defence was a disabled button.

### The model

`command_idempotency` (migration `0027`), with a unique index on
`(household_id, command_type, idempotency_key)`:

| Column | Purpose |
|---|---|
| `household_id`, `command_type`, `idempotency_key` | canonical command identity |
| `request_hash` | SHA-256 of the canonical request; detects the same key reused for different economics |
| `result` | identity of what was created, so a retry re-reads the entity rather than replaying a frozen response |
| `created_at`, `completed_at` | lifecycle |

`runIdempotentCommand()` (`apps/api/src/common/command-idempotency.ts`) reserves the row and
runs the command body **in one transaction**, so either the whole aggregate and its
idempotency record commit together or neither does. Concurrency is handled by the unique
index rather than by a lock of our own: `ON CONFLICT DO NOTHING` makes a losing transaction
wait on the winner's row lock, so by the time it reads back the winner has committed and it
returns the winner's result. If the winner rolled back, the key is free again and the
attempt is not a retry of anything.

Vehicle create became a single atomic aggregate command in the process: vehicle, ownership,
finance agreement, asset and loan accounts, opening positions and the audit row all share
one transaction, with derived-cache refresh moved after the commit.

### Endpoint matrix

Every user-initiated create that has an economic effect:

| Endpoint | Accepts key | Uses it | DB-protected | Same-key retry | Same key, changed payload | Different key, same shape |
|---|---|---|---|---|---|---|
| `POST /accounts` | ✅ | ✅ | ✅ `command_idempotency` | one account, one opening snapshot | `409 IDEMPOTENCY_CONFLICT` | second account created (product allows duplicates by name) |
| `POST /vehicles` | ✅ | ✅ | ✅ `command_idempotency` | one vehicle + one asset + one loan | `409 IDEMPOTENCY_CONFLICT` | second vehicle created |
| `POST /ledger/expenses` | ✅ | ✅ | ✅ financial-event key | one event | `409` | two events |
| `POST /ledger/income` | ✅ | ✅ | ✅ | one event | `409` | two events |
| `POST /ledger/refunds` | ✅ | ✅ | ✅ | one event | `409` | two events |
| `POST /ledger/transfers/internal` | ✅ | ✅ | ✅ | one event | `409` | two events |
| `POST /ledger/credit-card/purchase` | ✅ | ✅ | ✅ | one event | `409` | two events |
| `POST /ledger/credit-card/payment` | ✅ | ✅ | ✅ | one event | `409` | two events |
| `POST /ledger/mortgage/payment` | ✅ | ✅ | ✅ | one event | `409` | two events |
| `POST /ledger/investments/transfer` | ✅ | ✅ | ✅ | one event | `409` | two events |
| `POST /ledger/assets/purchase` | ✅ | ✅ | ✅ | one event | `409` | two events |
| `POST /ledger/assets/financed-purchase` | ✅ | ✅ | ✅ | one event | `409` | two events |
| `POST /ledger/assets/depreciation` | ✅ | ✅ | ✅ | one event | `409` | two events |

Naturally idempotent, so no key needed: `POST /ledger/events/reverse` returns the existing
event when it is already `REVERSED`.

No economic effect, therefore not protected and not treated as a defect here: goal and
sinking-fund contributions, categories, scenarios, vehicle candidates, documents and
sources write planning or metadata rows only and post nothing to the ledger. A duplicate
overstates goal progress; it cannot misstate net worth.

### Scope

Identity is `householdId + commandType + Idempotency-Key`, never a global namespace, so the
same key used for `CREATE_ACCOUNT` and `CREATE_VEHICLE` does not collide
(`[PASS] RT2-002i`).

### Verification

```
[PASS] RT2-002a account create identical retry yields one account
[PASS] RT2-002b account retry books one opening snapshot: snapshots 1
[PASS] RT2-002c account same key + changed payload conflicts: 409 IDEMPOTENCY_CONFLICT
[PASS] RT2-002d account concurrent same-key retry yields one account: 8 requests, 1 row
[PASS] RT2-002e vehicle create identical retry yields one aggregate: 1 vehicle, 1 asset, 1 loan
[PASS] RT2-002f vehicle retry does not inflate net worth: delta 9000000 expected 9000000
[PASS] RT2-002g vehicle same key + changed payload conflicts: 409
[PASS] RT2-002h different key creates a genuinely new vehicle: 201
[PASS] RT2-002i same key across command types does not collide
```

Plus `apps/api/src/common/command-idempotency.test.ts`, which covers the rollback case (a
failed command leaves the key reusable) and concurrency at the helper level.

---

## RT2-003 — command identity separated from natural identity

### What was wrong

Five endpoints synthesised an `externalId` from the economic shape of the request —
`api-transfer-{from}-{to}-{date}-{amount}` and similar. That identifier sat under a
uniqueness constraint, so a second legitimate action of the same shape on the same day was
refused `409 IDEMPOTENCY_CONFLICT` even with a different `Idempotency-Key`. Moving 500 kr to
savings twice in one day was impossible, and the error blamed a retry for a new command.

### The distinction, now enforced

| Identity | Answers | Source | On match |
|---|---|---|---|
| `Idempotency-Key` | "is this HTTP command a retry of the **same user intent**?" | client, opaque, scoped per command type | return the same result; `409` if the content differs |
| `externalId` | "is this the **same record at the source**?" | provider or import | deduplicate as the same record |
| Business natural key | "does the domain forbid two entities like this?" | the domain | a **domain** error, never an idempotency conflict |

Synthesised `externalId`s are gone. An `externalId` is now stored only when the caller
supplies one, which only an import does. `persist-event.ts` resolves both identities in
order: source identity first (a provider record already seen is the same record), then
command identity (a replayed client command is the same command). Provider deduplication is
therefore untouched and remains available for the mock and future real sources.

### Verification

```
[PASS] RT2-003a two same-shape transfers with different keys are both recorded: events 2
[PASS] RT2-003b two same-shape card payments with different keys are both recorded: events 2
[PASS] RT2-003c same key retry still collapses to one event: events 1
[PASS] RT2-003d explicit provider externalId still dedupes across keys: events 1
```

---

## RT2-004 — route identity in end-to-end tests

### What was wrong

`expect(page.getByRole("heading").first()).toBeVisible()` is satisfied by the Next.js 404
page, because the not-found result renders inside the application shell and the shell has
headings of its own. Pointing the mobile spec back at `/money` — HTTP 404 — still passed.
Replacing the route removed the instance; it did not close the class.

### The fix

Two layers, both asserted, in `e2e/helpers/route-identity.ts`:

- **Title.** Every routable page declares its own `metadata.title`, and the root layout
  supplies the `· Family Financial OS` suffix. The document title therefore names the route
  that rendered, and it does so without depending on any API request succeeding — which
  makes it a reliable answer to "which page is this?" even when the page's data is missing.
- **Content.** The page's own level-1 heading, plus for the critical surfaces a control only
  that page offers (the search box on transactions, "Skapa konto" on accounts, "Lägg till
  fordon" on vehicles, the More menu's navigation landmark).

`isNotFoundPage()` recognises the not-found result by title, by
`data-testid="not-found"` (honoured in advance so a custom page stays detectable) and by its
copy in both languages. `expectNotFoundPage(page, false)` runs on every navigation, so
landing on 404 fails explicitly rather than being inferred from an HTTP status a client-side
navigation may not produce. A route with no declared identity is itself a failure: a surface
reachable from the product without an entry in the contract is a gap, not a pass.

`e2e/route-contract.spec.ts` walks the desktop sidebar, the mobile bottom navigation, the
More menu and the dashboard quick actions, and requires every href to resolve to its own
identified page. A primary navigation link that 404s now fails the suite.

### Mutation proof

The guard was tested by breaking it deliberately, twice:

```
Mutation 1 — point the mobile spec at /money and /definitely-does-not-exist
  1 failed: No route identity is declared for "/money".
            A surface reachable from the product without an identity here is a gap
            in the contract, not a pass.

Mutation 2 — declare an identity for /money (so the table cannot be what fails)
             and navigate to it
  1 failed: http://localhost:3000/money rendered the not-found page

Reverted; the same spec then passes 6/6.
```

Mutation 1 proves the contract layer catches an undeclared route; mutation 2 proves the
not-found detection catches a declared route that 404s. Under the previous assertion both
mutations passed.

---

## RT2-005 — the honest test command

### What was wrong

Turborepo runs tasks in `strict` env mode and the `test` task declared no env allowlist, so
`DATABASE_URL` was stripped before the suite started. All 129 guards of the form
`if (!process.env.DATABASE_URL) return;` fired and each counted as a pass: 2.2 s instead of
33 s, and an unchanged repository skipped even that from cache. When the variable *was*
exported it pointed at the same database the running application mutated, and renaming the
demo household still produced 129 passes.

### The fix

Full topology in [`docs/testing/TEST_TOPOLOGY.md`](../testing/TEST_TOPOLOGY.md). In brief:

- **Dedicated databases.** `ffos_dev` for development, `ffos_test` for the suite, both
  created by `infrastructure/docker/postgres-init/01-create-databases.sh`. Nothing is named
  plain `ffos` any more, so the name states the environment. Redis is split by logical
  database (`0` for the application, `1` plus a `test` queue prefix for the suite).
- **`.env.test`** holds the test environment, and `pnpm test` is
  `node scripts/run-tests.mjs`, which loads it, refuses to start unless the database name
  ends in `_test`, builds, migrates, reseeds, runs each suite with the environment passed
  through explicitly, and then proves execution.
- **Loud guards.** `requireTestDatabase()` throws when there is no test database — and also
  when the URL points at a development or unrecognised one, so a misconfigured shell cannot
  have the suite mutate real development data. `requireTestRedis()` rejects logical database
  `0`. `assertFixture()` and the `requireDemoHousehold()` family replaced every
  `if (!fixture) return;`.
- **Execution proof.** Every entry into a database-backed test appends to
  `FFOS_TEST_EXECUTION_LOG`; the runner fails below a floor of 60 and prints the count. A
  count is proof that the guarded bodies ran; duration is not, because a suite can be fast
  for the wrong reason.
- **Turbo corrected too** — the `test` task now declares its env allowlist and
  `cache: false`, so the same failure cannot recur through turbo.
- **Serial API suite** (`--test-concurrency=1`), which removes the twelve-way contention
  against one shared household that produced the earlier unexplained one-off failure.

### Execution counts

```
▶ @ffos/domain             4 tests    ▶ @ffos/api   155 tests
▶ @ffos/utils              1 test     ▶ Database-backed tests executed: 106
▶ @ffos/schemas           16 tests
▶ @ffos/financial-engine 101 tests    277 tests, 0 failed, 0 skipped
```

Playwright: 63 tests, 53 executed per run; the 10 skips are mobile-only specs in the desktop
project and desktop-only specs in the mobile project, so every test runs in the project it
targets.

### Isolation evidence

Four consecutive full `pnpm test` runs with the development stack up, and a Playwright
desktop + mobile run driving the development database concurrently: **0 failures, 0
shared-state contention failures**. This demonstrates isolation. It does not prove the
absence of flakiness, which no finite number of runs can, and is not claimed.

---

## RT2-006 — destructive reset guarded

Detail in [`docs/safety/DATABASE_RESET_GUARD.md`](../safety/DATABASE_RESET_GUARD.md).

Four independent conditions must all hold before `DROP SCHEMA` runs: `NODE_ENV` is not
`production`; the target parses and names itself disposable (`*_dev` or `*_test`);
`FFOS_ALLOW_DB_RESET=true`; and a development database additionally needs the operator to
name it (`FFOS_DB_RESET_CONFIRM=<database>` or `--yes`). A protected marker — `prod`,
`production`, `staging`, `stage`, `live`, `pilot`, `customer` — anywhere in the database name
**or the host** refuses outright, and beats a disposable suffix: `prod_test` is refused, and
so is `ffos_test` at `db.production.internal`. Anything unrecognised, including a malformed
or missing URL, is refused, because the cost of being wrong is asymmetric.

CI stays non-interactive: there are no prompts, a test database resets with permission
alone, and everything else refuses rather than waiting for input. Guard output carries host,
port, database and classification and never credentials — asserted with a URL whose password
is `hunter2`. `pnpm db:seed` is guarded the same way.

Ten unit tests in `apps/api/src/db/reset-guard.test.ts` cover every row of the policy table,
including the credential-leak check.

---

## RT2-007 — dependency advisory

`drizzle-orm` was `0.44.7`, affected by GHSA-gpj5-g38j-94v9 (HIGH, SQL injection through
improperly escaped SQL identifiers, patched in `0.45.2`).

Upgraded to `0.45.2`. `pnpm audit` no longer reports it, `apps/api` resolves the patched
version, and build, typecheck, lint and the full suite pass on it. Reachability had already
been checked rather than assumed — no `sql.raw(`, `sql.identifier(`, `$dynamic` or
user-controlled identifier anywhere in `apps/api/src` — so this is hygiene rather than an
exploited hole, but the advisory is now resolved rather than accepted.

`drizzle-kit generate` fails on this repository with `Do not know how to serialize a BigInt`
when introspecting the `bigint`-heavy schema. That is a `drizzle-kit` limitation, not
`drizzle-orm`, and it does not affect the runtime or `drizzle-kit migrate`: migrations in
this repository are hand-written SQL and applied by `src/db/migrate.ts`. Recorded as a known
development-tooling limitation.

Remaining `pnpm audit` output is 4 HIGH and 3 moderate, none on a production-reachable
package: `sharp` is not imported by any application code, and `postcss`, `js-yaml` and
`esbuild` are build and development tooling. Unchanged in scope by this remediation.

---

## RT2-008 — snapshot uniqueness

### Granularity first

`(account_id, as_of)` would have been the wrong key. Several sources legitimately describe
the same account at the same instant — `seed`, `manual_opening`, `ledger_reconcile`,
`nw_history_reconstruct` — and the history reader ranks between them. The domain key is
therefore `(account_id, as_of, source)`, and that is what migration `0027` enforces.

The instant also had to be made canonical, or the constraint could not recognise two rows as
the same fact: every writer now stamps midday UTC of the snapshot's calendar day via
`snapshotAsOfDate()` (midday rather than midnight so no plausible local timezone shifts a
snapshot onto the neighbouring date).

### Duplicate resolution

113 duplicate groups existed, from two concurrent delete-then-insert reconcile runs. The
migration resolves them by a documented rule rather than arbitrarily: within one
`(account_id, as_of, source)` group keep the greatest `id` and delete the rest. Every row in
such a group was produced by the same writer for the same instant, so they describe the same
fact and the greatest id is the freshest. Historical `manual_opening` rows written at an
arbitrary wall-clock instant are normalised onto the midday convention first, then collapsed
by the same rule. Nothing financially distinct is removed, because a snapshot from a
different source, instant or account is by definition in a different group.

The migration then **fails loudly** with a count if any duplicate group remains, rather than
silently skipping the index.

Both writers changed from delete-then-insert to `ON CONFLICT DO UPDATE`, so the invariant is
now maintained where snapshots are created rather than repaired where they are read.

```
[PASS] RT2-008a duplicate (account, as_of, source) snapshot is rejected by the database
[PASS] RT2-008b no duplicate snapshot groups remain in the database: duplicate groups 0
```

---

## As-of positions (found during this remediation)

`getLedgerAlignedAccountRows` summed every posting regardless of date, so "net worth as of
31 May" returned today's balance. The history series does respect `asOf`, so the series
disagreed with its own final point as soon as any event was booked after the demo freeze —
which an E2E run does routinely. This is the write-side residue of original finding RT-004,
and it made `rt-repro.py` fail its RT-004 check even though the read-side deduplication was
correct.

Fixed by bounding the reconstruction with `booked_on <= asOf` and threading `asOf` through
the debt, wealth, decisions and opportunity callers. A position is now a position **at a
date** everywhere. `RT-004` and `RT-004b` pass, with the final history point, current net
worth and the registry all at `549 791 368` on the freshly seeded demo.

---

## Two harness defects found by the final regression

Both reproduction scripts passed on a freshly seeded database and then failed when re-run
against one that end-to-end tests and the scripts themselves had written to. In both cases
the product was right and the script's expectation was wrong, which is worth recording:
an oracle is only independent if it asks the same question as the surface it audits.

**`RT-001` compared against the machine's date.** `datetime.date.today()` is the host's
calendar date, but a household's "today" is resolved in `APP_TIME_ZONE`
(`apps/api/src/common/as-of.ts`). On a UTC host between 22:00 and midnight the two differ,
so the API's correct `2026-08-09` was checked against `2026-08-08`. The script now computes
the expected date in the application timezone.

**`RT2-001e` compared an `asOf` answer against a "now" column.** The check summed
`accounts.current_balance_minor`, which is the position *now*, while `/net-worth` reported
the demo household's frozen `2026-08-01`. One posting booked after the freeze — an
end-to-end run books several — made them differ by 4 000 kr and the script reported a sign
bug that did not exist. The check now rebuilds the position the way the oracle in
`scripts/financial-oracle.py` always did: opening balance plus the postings booked on or
before the date the surface itself reports. That is also why the oracle stayed green
throughout while this check went red.

After both corrections all three scripts pass against a database carrying end-to-end and
reproduction residue, which is a stronger result than a pass on a clean seed.

---

## Acceptance

| Criterion | Result |
|---|---|
| RT2-001 liability / net worth | PASS |
| Independent net worth oracle | PASS |
| RT2-002 account idempotency | PASS |
| RT2-002 vehicle idempotency | PASS |
| RT2-003 command vs source identity | PASS |
| Two legitimate same-shape actions | PASS |
| RT2-004 mobile 404 guard | PASS |
| 404 mutation test | PASS (both mutations fail as required) |
| RT2-005 `pnpm test` executes the DB suite | PASS (106 DB-backed tests, counted) |
| Dedicated test database | PASS (`ffos_test`) |
| Test/dev isolation | PASS (0 contention failures in 4 concurrent runs) |
| RT2-006 `db:reset` guard | PASS |
| RT2-008 snapshot uniqueness | PASS on `(account_id, as_of, source)` |
| RT2-007 dependency advisory | RESOLVED |
| Original reproductions | PASS 13/13 |
| Financial P0 | PASS |
| Household isolation | PASS |
| Build / lint / typecheck | PASS |
| Tests | PASS |
| Docker | PASS |

**Remaining blockers: 0. Remaining highs: 0.**

Not claimed: V1 acceptance, pilot readiness, or any Medium/Low work beyond RT2-007 and
RT2-008. The Medium and Low findings recorded in the re-acceptance
(RT-005, RT-006, RT-007, RT-008, RT-011, RT2-009, RT2-010, and the Low set) remain open by
instruction. One of them, RT-006, is visible in this remediation's own tests: a
principal-only mortgage payment is still rejected, so principal neutrality had to be proven
by holding interest constant instead.
