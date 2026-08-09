# Final Pilot Remediation — FPA-001 … FPA-004

**Date:** 2026-08-09
**Branch:** `cursor/final-pilot-blockers-9c58`
**Scope:** the two BLOCKER and two HIGH findings from
[`V1_FINAL_PILOT_ACCEPTANCE_FINDINGS.md`](../acceptance/V1_FINAL_PILOT_ACCEPTANCE_FINDINGS.md).
**Explicitly out of scope:** FPA-005 … FPA-010 and every finding carried over
from earlier audits.
**Reproduction log:** [`FINAL_PILOT_REPRO.md`](./FINAL_PILOT_REPRO.md)

This report records what changed and how it was verified. It does **not** declare
pilot readiness. That is decided by re-running the Final Pilot Acceptance.

---

## Verdict table

| Item | Result |
|---|---|
| FPA-001 unsupported currency bricks the household | **PASS** |
| FPA-002 production accepts the published placeholder secret | **PASS** |
| FPA-003 budget does not bootstrap for a non-demo household | **PASS** |
| FPA-004 erasure requests cannot be executed | **PASS** |
| Independent financial oracle | **PASS** — 12 / 12, 92 households |
| Original pilot probes | **53 / 66** (baseline 45 / 67) — every in-scope check flipped; all remaining failures are out-of-scope MEDIUM/LOW |
| Security probes | **PASS** — placeholder, wrong-secret, tampered, unsigned, expired, cross-household read/write all rejected |
| Non-demo household | **PASS** — 39 / 39 surfaces answer on a household built only through product paths |
| Budget bootstrap | **PASS** — 17 / 17 |
| Erasure | **PASS** — 21 / 21 |
| Build | **PASS** |
| Lint | **PASS** |
| Typecheck | **PASS** |
| Tests | **PASS** — 189 tests, 0 fail, 115 database-backed |
| Docker | **PASS** — images build, stack healthy, E2E and the production-secret probe both run inside it |
| **Remaining BLOCKER** | **0** |
| **Remaining HIGH** | **0** |

Unsupported currency cannot brick a household: **PASS**.
Archived unsupported account recovery: **PASS**.
Published placeholder secret rejected: **PASS**.
Production missing/weak secret fails closed: **PASS**.
Non-demo household can create and use a budget: **PASS**.
Household erasure executes: **PASS**.
User deletion semantics: **PASS**.
Raw and object data erasure: **PASS**.
Household isolation: **PASS**.

---

## The financial core was not reopened

The independent double-entry oracle is unchanged and still derives net worth
from the accounting identity rather than from product aggregation helpers. It ran
after each of the four fixes and again at the end:

```
[PASS] ACC-010 double-entry identity holds per household:
       Δ(assets−liabilities) = income − expenses: households checked 92, breaks none
[PASS] ACC-011 product net worth equals opening positions plus income minus expenses:
       product 787391368 derived 787391368 (opening 653000000 + flow 134391368) delta 0
[PASS] ACC-012 each step of the net worth series equals that period's income minus expenses:
       steps checked 5, breaks none
```

No ledger, money or net-worth module appears in this batch's diff. The only
`financial-engine` file touched is `planning.ts`, and only to give budget rollup
a catch-all group — it performs no money arithmetic on the balance sheet.

The five original probes are **byte-identical** to their pre-remediation state:

```
$ git diff --stat 8c781c9 HEAD -- scripts/pilot/accounting-integrity.py \
    scripts/pilot/pilot-journey.py scripts/pilot/security-probe.py \
    scripts/pilot/open-findings.py scripts/pilot/data-robustness.py
(no output)
```

---

## FPA-001 (BLOCKER) — an unsupported currency can no longer brick a household

### Decision

V1 does not pretend to aggregate multiple currencies. A financially aggregated
account must use the household base currency. Foreign-currency rows that already
exist are **excluded from totals and reported**, never guessed at with an
invented rate and never allowed to fail the household's screens.

### Changes

| Layer | Change |
|---|---|
| Domain | `apps/api/src/metrics/currency-support.ts` — `UnsupportedCurrencyException` (422 `UNSUPPORTED_ACCOUNT_CURRENCY`), `assertAggregatableCurrency`, `partitionByAggregationCurrency`, `activeCurrencyWarnings` |
| Create/update | `accounts.service.ts` asserts the currency against the household base currency before anything is written |
| Aggregation | `household-metrics.service.ts` partitions accounts; only base-currency rows reach the aggregate, and the old bare `Error` (rendered as `500`) is now a defence-in-depth assertion behind that filter |
| Coverage signal | `getFinancialSnapshot` reports `excludedByCurrency`; `dashboard.service.ts` and `packages/schemas/src/dashboard.ts` carry it to the client |
| UX | `accounts-page.tsx` shows `SEK` as text with “Fler valutor kommer senare.” instead of a select offering EUR/USD; `dashboard-view.tsx` renders an actionable warning naming each excluded account |
| Remediation path | archiving the account through the ordinary product action removes it from both the aggregate and the warning |

Archived accounts never participate in the guard: they are filtered before the
currency check, so an invalid legacy row can always be resolved without deleting
history.

### Verification

`scripts/pilot/currency-legacy.py` — 11 / 11. A EUR row is inserted straight
into the database to imitate one created before the fix:

```
[PASS] LEG-003 the household keeps working with that row in place: every aggregate surface answers
[PASS] LEG-004 the totals leave out the account they cannot convert rather than guessing a rate
[PASS] LEG-005 the participant is told which account is missing from the totals
[PASS] LEG-006 creating another one is refused with a domain error, not a server error: 422
[PASS] LEG-007 the participant can archive the offending account through the product
[PASS] LEG-008 the household is fully recovered after archiving
[PASS] LEG-010 archiving did not move the household's reported net worth
```

The original reproduction no longer reproduces:

```
[PASS] ROB-001 an account in a currency the engine cannot aggregate is refused at creation: → 422
[PASS] ROB-002 the participant's surfaces keep working after that account exists: none
```

ROB-003 (“removing the offending account restores the surfaces”) no longer
executes, because the probe only runs it when the EUR account was created and
creation is now refused. Its intent is covered by LEG-007/LEG-008.

Dashboard, Net Worth, Forecast, Insights, Metric Registry, Debt and Investments
all answer with the legacy row present, with it archived, and on a clean SEK
household. Unit tests: `apps/api/src/metrics/currency-support.test.ts`.
Browser: `e2e/final-pilot-blockers.spec.ts`.

---

## FPA-002 (BLOCKER) — production can no longer start on a published secret

### Changes

| Layer | Change |
|---|---|
| Secret validation | `jwt-secrets.ts` — explicit `FORBIDDEN_SECRETS` denylist (repository defaults, `.env.example` values, `changeme`/`secret`/`test` placeholders, documentation samples) plus `FORBIDDEN_PATTERNS`, a minimum production length and a distinct-character floor. Rejection is by identity first, not by entropy heuristics alone |
| Fail closed | `assertProductionSecret` throws `InsecureSecretError`. There is no development fallback and no silently generated ephemeral secret in production |
| Config contract | new `production-config.ts` requires database URL, Redis, object storage and allowed origin in production, rejects `localhost` and wildcard origins, and refuses to start with destructive database resets enabled |
| Bootstrap | `main.ts` and `worker.ts` call `assertProductionConfiguration()` before anything else, so both entrypoints fail closed |
| Development | `scripts/generate-dev-secrets.mjs` (`pnpm secrets:dev`) writes strong random secrets into the git-ignored `.env`; `docker-compose.yml` now uses `${JWT_ACCESS_SECRET:?}` instead of a hardcoded placeholder; `.env.example` ships no usable secret |
| Docs | [`docs/operations/PRODUCTION_CONFIGURATION.md`](../operations/PRODUCTION_CONFIGURATION.md) — required variables per environment, `openssl rand -base64 48` generation, and rotation |

Rotation is documented rather than engineered: the token architecture has one
verification key, so rotating it invalidates outstanding access tokens. That is
stated explicitly as accepted V1 behaviour instead of being hidden behind a
KMS design.

### Verification

`scripts/pilot/production-secret.py` — 14 / 14, run against a real API container
with `NODE_ENV=production`:

```
[PASS] PROD-001 production refuses to start when the access secret is the published placeholder
[PASS] PROD-002 … is missing        [PASS] PROD-003 … is too weak
[PASS] PROD-004 … is malformed      [PASS] PROD-005 … a required service is unconfigured
[PASS] PROD-006 … with destructive database resets enabled
[PASS] PROD-007 a production process with a generated secret starts normally
[PASS] PROD-008 a token signed with the published placeholder is rejected: 401
[PASS] PROD-009 a token signed with some other strong secret is rejected: 401
[PASS] PROD-010 a token whose payload was edited after signing is rejected: 401
[PASS] PROD-011 an expired token is rejected even though it is correctly signed: 401
[PASS] PROD-012 an unsigned "alg: none" token is rejected: 401
[PASS] PROD-013 a session issued by the production-configured process works: 200
[PASS] PROD-014 the running process never writes its signing secret to the logs
```

Every refusal was checked for secret leakage into the logs; none leaked. The
original reproduction is gone:

```
[PASS] SEC-017 the production guard refuses the placeholder secrets this repository publishes: accepted in production []
[PASS] SEC-018 a token signed with the published placeholder is not accepted: → 401
```

Unit tests: `apps/api/src/common/jwt-secrets.test.ts`.

---

## FPA-003 (HIGH) — a household can create and keep a budget without seed data

### Decision

Option A from the brief, in the shape the model already supports: `GET /budget`
returns `200` with an explicit empty state, and creating a budget materialises
the current monthly period. Later months are materialised lazily on first read
by copying the previous month, so no monthly database edit is ever needed.

### Changes

| Layer | Change |
|---|---|
| Defaults | `budget-defaults.ts` — the Simple budget groups (Boende, Mat, Transport, Familj, Livsstil, Övrigt) and month-boundary helpers |
| Empty state | `budget.service.ts` returns `hasBudget: false` with zeroed totals and `suggestedGroups` instead of throwing `NotFoundException` |
| Create | `POST /api/v1/budget` (`budget.controller.ts`) with an `Idempotency-Key`, `CREATE_BUDGET` in `command-idempotency.ts` |
| Rollover | `planning-metrics.service.ts` — `rolloverIntoCurrentMonth` checks for an existing current period before copying, so repeated reads roll over once |
| Actuals | `packages/financial-engine/src/planning.ts` routes uncategorised spend into the `other` line when the budget has one, so a new budget shows real numbers rather than a column of zeroes |
| UI | `budget-page.tsx` renders the empty state with the suggested groups and a **Create budget** action, keyed for idempotent submission |

### Verification

`scripts/pilot/budget-bootstrap.py` — 17 / 17 on a household created entirely
through product paths:

```
[PASS] BUD-001 a household with no budget gets a usable answer rather than a dead end: 200, hasBudget False
[PASS] BUD-004 the participant can create a first budget without any seed data: 201, period 2026-08
[PASS] BUD-006 an exact amount entered against a line is stored to the öre: 850000
[PASS] BUD-007 the budget is still there after a reload
[PASS] BUD-008 real spending shows up against the budget rather than a column of zeroes
[PASS] BUD-009 creating twice, or retrying a create, does not produce a second period: 1 → 1
[PASS] BUD-010 a repeated create does not overwrite amounts the participant entered
[PASS] BUD-011 the dashboard reports what is left of the budget
[PASS] BUD-012 a budget made last month carries into this one without a database edit
[PASS] BUD-014 reading the new month repeatedly rolls over once, not once per read: periods 2
[PASS] BUD-016 another household's budget stays out of reach: 403
```

The original reproduction is gone:

```
[PASS] RT-005  the Budget surface answers for a household the participant built: → 200
[PASS] RT-005b a product path exists to create a budget period: outside the seed, yes
[PASS] PILOT-004 every product surface answers for a brand-new empty household: surfaces 39, failing none
[PASS] PILOT-014 every product surface still answers once the household holds real data: failing none
```

---

## FPA-004 (HIGH) — erasure is executed, not merely recorded

### Lifecycle

`requested → confirmed → processing → completed`, with `failed` and `cancelled`.
A single click cannot erase anything: confirmation requires typing the household
name exactly, and only an OWNER of that household may confirm.

### What erasure removes

| Step | Behaviour |
|---|---|
| Object storage | every document object is collected and deleted from MinIO before the rows go, via a new `deleteObject` / `objectExists` pair on `object-storage.service.ts` |
| Non-cascading rows | `source_transaction_links` and the other tables nothing cascades from are deleted explicitly |
| Raw source data | `raw_import_records`, `import_batches`, `source_transactions`, the extracted fields on `documents`, and connector state in `data_sources` / `sync_runs` all go with the household |
| Household | one household-scoped delete; the schema cascade removes the remaining 60 household-scoped tables — accounts, ledger, metrics, budgets, goals, vehicles, documents, integrations, recommendations and the rest |
| Audit | `audit_logs` rows are stripped of `before`, `after`, `entity_id` and `household_id`, leaving a non-personal record that an erasure happened |
| The request itself | the participant's own note and the household link are nulled |

Deletion is household-scoped SQL. It does not reuse `DROP SCHEMA` or any broad
reset path, so the reset-safety work from the previous batch stands:

```
$ grep -nE "drop schema|truncate|resetDatabase|drop table" apps/api/src/privacy/erasure.service.ts
no broad-reset or DDL constructs in erasure.service.ts
```

`apps/api/src/db/reset-guard.test.ts` still passes.

### User deletion

| Case | Behaviour |
|---|---|
| No household | the user is deleted |
| Member of a shared household | the user leaves; the household survives |
| One of several owners | the user leaves; the household survives |
| Sole owner of a household others are in | `409 SOLE_OWNER_OF_SHARED_HOUSEHOLD` — transfer ownership or erase the household first |
| Sole owner, sole member | the household goes with the user rather than being stranded |

### Policy and protection

The audit-versus-erasure trade-off is written down in
[`docs/privacy/ERASURE.md`](../privacy/ERASURE.md): what survives is that an
erasure occurred, and nothing about the money. The seeded demo household is
refused outside production so a development click cannot destroy the fixture;
production relies on ownership and policy, not on a magic id.

### Verification

`scripts/pilot/erasure.py` — 21 / 21 against a purpose-built household holding
4 accounts, ledger entries, source transactions and links, a budget, a vehicle,
a document with a real stored object, a raw import record and a second member:

```
[PASS] ERA-003 requesting deletion does not erase anything on its own
[PASS] ERA-004 confirming with the wrong name is refused: 400
[PASS] ERA-005 someone who does not own the household cannot confirm its erasure: 403
[PASS] ERA-006 the owner can execute the erasure by typing the household name: 1 objects, 26 rows
[PASS] ERA-007 no household-scoped row survives the erasure: nothing left
[PASS] ERA-009 the household is no longer reachable through the product: 404
[PASS] ERA-010 the assistant cannot reach the erased household either: 404
[PASS] ERA-011 search finds nothing from the erased household: 404, hits 0
[PASS] ERA-012 the stored object is removed from object storage, not only its row: gone
[PASS] ERA-013 raw source copies and their links go too
[PASS] ERA-014 the database is left without orphans: none
[PASS] ERA-015 the audit keeps a non-personal record that an erasure happened, and nothing more
[PASS] ERA-017 running the erasure again is safe and resurrects nothing: second confirm → 404
[PASS] ERA-018 the sole owner of a shared household cannot delete themselves and strand it: 409
[PASS] ERA-020 a household only that user could reach goes with them
[PASS] ERA-021 the seeded demo cannot be erased by accident outside production: 403
```

Integration tests: `apps/api/src/privacy/erasure.integration.test.ts`.
Browser: `e2e/final-pilot-blockers.spec.ts` covers the two-step confirmation,
including that a mismatched name leaves the destructive button disabled.

ERA-014 checks five tables by name, so the orphan claim was also verified the
wide way — generated across **every** table in the schema that carries a
`household_id`, not a chosen list:

```sql
-- 60 tables carry household_id; none holds a row pointing at a missing household
select ... from information_schema.columns
where table_schema='public' and column_name='household_id' and table_name <> 'households'
→ none
```

The same sweep over the child references that have **no** foreign key
(`financial_events.import_batch_id`, `source_transactions.import_batch_id`,
`source_transaction_links.source_transaction_id`, `documents.vehicle_id`) also
returns `none`, so nothing survives by escaping the cascade.

The only rows that mention an erased household are the ones policy keeps: 94
`audit_logs` rows and 7 `privacy_requests` rows whose `household_id` has been
set to `null` and whose payloads were stripped. That is the documented
audit-versus-erasure outcome, not a leak.

---

## Original probe results, before and after

| Probe | Before | After | Δ |
|---|---|---|---|
| `accounting-integrity.py` | 12 / 12 | **12 / 12** | held |
| `pilot-journey.py` | 13 / 16 | **15 / 16** | PILOT-004, PILOT-014 |
| `security-probe.py` | 14 / 18 | **16 / 18** | SEC-017, SEC-018 |
| `data-robustness.py` | 5 / 9 | **7 / 8** | ROB-001, ROB-002 (ROB-003 no longer applicable) |
| `open-findings.py` | 1 / 12 | **3 / 12** | RT-005, RT-005b |
| **Total** | 45 / 67 | **53 / 66** | every in-scope check |

Remaining failures, all deliberately untouched:

| Check | Finding | Severity |
|---|---|---|
| ROB-004 oversized amounts → `500` | FPA-005 | MEDIUM |
| SEC-011 `password` accepted at registration | FPA-006 | MEDIUM |
| SEC-014 no throttling observed | development stack sets `FFOS_RATE_LIMIT=2000` for E2E | configuration |
| PILOT-002 / RT-010 register leaves no household | RT-010 | LOW |
| RT-006, RT-007, RT-008, RT-011 | carried over | MEDIUM |
| RT-009, RT-014, RT2-010 | carried over | LOW / cosmetic |
| RT-015 backup/restore tooling | FPA-008 | MEDIUM |

FPA-007 (no production deployment descriptor) is partially answered by the
configuration contract added for FPA-002, but no deployment descriptor was
written and it is **not** claimed as fixed.

---

## Technical gates

| Gate | Result |
|---|---|
| `pnpm build` | PASS — 11 tasks |
| `pnpm lint` | PASS — 18 tasks |
| `pnpm typecheck` | PASS — 18 tasks |
| `pnpm test` | PASS — 189 tests, 0 fail, 115 database-backed, dedicated test database |
| Reset guard + new unit suites | PASS — 36 tests |
| Desktop E2E (chromium) | PASS |
| Mobile E2E | PASS |
| E2E total | 57 passed, 10 skipped |
| Docker | PASS — `api`, `web`, `worker` images build; stack healthy; `/health` 200 |
| Fresh migrations | PASS — clean database → 65 tables |
| Backup / restore smoke | PASS — 92 households / 1 040 postings dumped and restored identically |

---

## Not done, on purpose

- No financial architecture, ledger logic or net-worth mathematics was reopened.
- No new product feature beyond what the four blockers required.
- No unrelated MEDIUM/LOW finding was addressed.
- No real-data pilot was started.
- The five original probes were not edited, and the oracle was not rewritten to
  call product aggregation helpers.

The next step is one **FINAL TARGETED PILOT RE-ACCEPTANCE**.
