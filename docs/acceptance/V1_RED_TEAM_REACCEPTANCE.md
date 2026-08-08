# V1 Red Team Re-Acceptance (post-remediation)

**Date:** 2026-08-08
**Scope:** Independent adversarial re-acceptance after the BLOCKER/HIGH remediation in PR #47
**Baseline:** `docs/acceptance/V1_RED_TEAM_ACCEPTANCE.md`, `docs/acceptance/V1_RED_TEAM_FINDINGS.md`, `docs/remediation/V1_RT_BLOCKER_HIGH_REPORT.md`, `scripts/rt-repro.py`
**Evidence:** `docs/acceptance/V1_RED_TEAM_REACCEPTANCE_FINDINGS.md`, `docs/acceptance/TEST_ENVIRONMENT_ISOLATION.md`
**Fixes during this audit:** none (two temporary mutations were applied to test the tests and reverted; `git status` clean)

---

## Verdict

# FAIL

The four original BLOCKER/HIGH defects are genuinely fixed. The audit nevertheless found
**2 new BLOCKER** and **4 new HIGH** defects, two of which can materially misstate a
household's net worth. V1 is therefore **not** ready for a controlled real-data pilot.

This is not a reversal of the remediation. Every original failure mode was re-driven with
its own reproduction and no longer reproduces. The new findings are in adjacent code that
the original audit did not reach: net worth aggregation when a liability carries a credit
balance, and the non-ledger create endpoints (`/vehicles`, `/accounts`) that the
remediation did not cover.

---

## Why FAIL

1. **NEW BLOCKER RT2-001 — net worth is misstated whenever a liability account holds a
   credit balance.** `bucketBalancesForNetWorth` takes the absolute value of liability
   balances, so a negative (credit) balance is counted as debt. Net worth is then wrong by
   exactly twice the credit balance. Paying a credit card in full and then overpaying it by
   2 000 kr moves reported net worth by −4 000 kr on a clean household. The **pristine demo
   seed already triggers this**: reported net worth `546 634 232` öre versus an
   independently computed `549 834 768` öre, a misstatement of **−32 005,36 kr**. All five
   net worth surfaces agree with each other, so cross-surface consistency checks cannot
   detect it. Pre-existing (introduced with the wealth APIs), not a regression from PR #47.

2. **NEW BLOCKER RT2-002 — `POST /vehicles` and `POST /accounts` accept `Idempotency-Key`
   and ignore it.** An identical retry creates a second vehicle plus a second asset and
   loan account, inflating net worth by the vehicle's equity (+70 000 kr in the
   reproduction). A retried account create duplicates the opening balance (+123 456 kr).
   The web client sends an idempotency key on these forms, so the request looks protected
   while only the disabled button prevents the duplicate. This is the same failure class as
   the original blocker RT-002, on the create paths the remediation itself introduced.

3. **NEW HIGH RT2-003 — legitimate repeated financial actions are refused.** Four endpoints
   synthesise a natural-key `externalId` from account ids, date and amount. A genuinely new
   second action carrying a *different* `Idempotency-Key` is rejected `409
   IDEMPOTENCY_CONFLICT` and is never recorded. Two identical transfers to savings on the
   same day, or two equal card payments on the same day, cannot be entered.

4. **NEW HIGH RT2-004 — the mobile 404 false-positive class is still open.** The remediated
   assertion `getByRole("heading").first()` is satisfied by the 404 page's own "404"
   heading. Repointing the mobile critical-path spec at `/money` (HTTP 404) still passes.

5. **NEW HIGH RT2-005 — the test gate is materially weaker than reported.** See
   `TEST_ENVIRONMENT_ISOLATION.md`. **`pnpm test` runs no database-backed test at all** —
   turbo's strict env mode strips `DATABASE_URL`, so the API suite finishes in 2.2 s
   instead of 33.4 s and every financial assertion returns through a guard. Without
   forcing, turbo replays the result from cache. When the suite does run it shares the
   development database and Redis with the running application, 36 files run 12-way
   parallel against one shared demo household, and 129 vacuous guards across 32 files make
   it report 129/129 pass with its fixture renamed. The one-off failure reproduced 1 in 12
   runs with the stack up and 0 in 4 with it stopped.

6. **NEW HIGH RT2-006 — `pnpm db:reset` can destroy a pilot database.** It runs
   `DROP SCHEMA public CASCADE` against whatever `DATABASE_URL` points at, with no
   environment guard, no named test database and no confirmation.

---

## Original BLOCKER / HIGH verdicts

Each original reproduction was re-driven, not replaced.

| ID | Severity | Original failure mode | Verdict |
|---|---|---|---|
| RT-002 | BLOCKER | Duplicate expense without `externalId` double-posts; `Idempotency-Key` ignored | **VERIFIED_FIXED** |
| RT-001 | HIGH | Global `asOf` defaults to the demo freeze for every household | **VERIFIED_FIXED** |
| RT-004 | HIGH | Net worth history point on the `asOf` day is 2× current net worth | **VERIFIED_FIXED** |
| RT-012 | HIGH | No API/UI path to create a vehicle outside the seed | **VERIFIED_FIXED** |
| — | HIGH | Mobile critical-path E2E not executable / skipped | **VERIFIED_FIXED** for execution; see RT2-004 for assertion strength |
| RT-003 | MEDIUM | Concurrent duplicate submissions | **VERIFIED_FIXED** |

**Original blockers remaining: 0. Original highs remaining: 0.**

`scripts/rt-repro.py` on a freshly reset database: **13/13 PASS**.

---

## Area results

| Area | Result | Basis |
|---|---|---|
| Financial correctness | **FAIL** | RT2-001 misstates net worth by 2× any liability credit balance; the demo seed is affected out of the box. Every other story check matched independent arithmetic exactly. |
| Data integrity | **PASS** | 0 unbalanced ledger entries, 0 orphan postings, 0 cross-household postings, 0 non-positive amounts, 0 events without an entry — including after replicating the ledger to 2.7 M postings. |
| Household isolation | **PASS** | 12 scoped read routes, a foreign account id, a cross-household write and a cross-household AI call all rejected 403/404. |
| AI grounding | **PASS** | Four adversarial prompts, including "invent our net worth" and "say we have 10 million": the advisor called deterministic tools and its `get_net_worth` value equalled the product value every time. No fabricated figure. |
| Vehicle calculations | **PASS** | Asset value, outstanding debt, equity (value − debt − selling cost), depreciation effect and the cost/TCO metric set matched independently computed expectations on a manually created vehicle. |
| Vehicle create | **FAIL** | All four acquisition modes book correct semantics, but the endpoint is not idempotent (RT2-002). |
| Mobile real-use | **PASS** | 28 mobile-project tests execute at 375 px with none skipped, on real routes, including account create, transaction detail and vehicle create. |
| Mobile 404 guard | **FAIL** | RT2-004. |
| `asOf` isolation | **PASS** | Demo keeps `2026-08-01`, a new household resolves to the real clock, four interleaved round-trips in one process stayed separate, explicit historical/current values honoured, seven malformed values rejected `400`, semantics survive an API restart. |
| Test-environment isolation | **GAP** | RT2-005. |
| Idempotency (ledger) | **PASS** | 11 ledger endpoints: identical retry, 8-way concurrent retry and conflicting retry each yield exactly one financial event, counted in Postgres. |
| Idempotency (non-ledger) | **FAIL** | RT2-002. |
| Net worth history | **PASS** | Buckets unique in every scenario; final point equals current net worth; same-day mutation, `asOf`-day depreciation and `asOf`-day principal each counted exactly once. |
| Large data | **PASS at pilot scale** | 5 055 transactions / 9 810 postings: every surface ≤ 176 ms. See RT2-009 for the scaling characteristic. |
| Security / dependencies | **PASS with recommendation** | No reachable SQL injection; a HIGH Drizzle advisory applies to a code path this application does not use (RT2-007). |

---

## Five-surface net worth consistency

Two runs on a freshly reset database. The expectation is computed independently from the
underlying account positions as `Σ assets − Σ signed liability balances`, not by comparing
product surfaces to one another.

| Surface | Run A — pristine demo | Run B — clean manual household |
|---|---|---|
| Independent expectation | `549 834 768` | `-20 750 000` |
| 1 Net worth endpoint / current | `546 634 232` | `-20 750 000` |
| 2 History final point | `546 634 232` | `-20 750 000` |
| 3 Metric registry | `546 634 232` | `-20 750 000` |
| 4 Dashboard | `546 634 232` | `-20 750 000` |
| 5 AI deterministic `getNetWorth` | `546 634 232` | `-20 750 000` |
| Surfaces agree with each other | yes | yes |
| Agree with the independent expectation | **no, off by −3 200 536** | **yes** |

Run A's demo household holds a credit card at `-1 600 268` öre. Run B has only positive
liability balances. The five surfaces are internally consistent in both runs — the
remediation's consistency work holds — but they agree on a wrong number whenever a
liability carries a credit balance.

**Verdict: FAIL.** Mutual consistency passes; agreement with the independent expectation
does not.

---

## Test-the-tests

| Check | Outcome |
|---|---|
| Controller guard (§6) | **Effective.** Reintroducing `resolveAsOf(query.asOf)` in `dashboard.controller.ts` failed the guard with `controllers must pass asOf through to the service: dashboard.controller.ts`. Reverted; no diff. Limitation: a textual scan of `*.controller.ts` only, so an equivalent pre-resolution through a helper would pass. |
| Mobile 404 guard (§13) | **Not effective.** Repointing the spec at `/money` (HTTP 404) still passed. Evidence: on that page `#main-content` hydrates and the headings present are `["404", "This page could not be found."]`, so `getByRole("heading").first()` is satisfied. Reverted. |
| Fixture-absence probe | Renaming `Familjen Demo` made the API suite still report **129/129 pass, 0 fail** — the database-backed assertions silently no-opped. Restored. |

---

## Route inventory

All 32 navigation destinations found in `apps/web/src` (bottom navigation, More menu,
sidebar, quick actions and inline links) return HTTP 200 against the running app, as do
sampled dynamic routes `/accounts/:id`, `/vehicles/:id` and the four vehicle sub-pages. No
dead or renamed primary navigation link. No E2E spec targets a route outside that set.

`/money`, the route behind the original false positive, returns HTTP 404 and is no longer
referenced. `/dashboard` still 404s (original RT-014, cosmetic).

---

## Quality gates

| Gate | Result | Note |
|---|---|---|
| Lint | **PASS** | 18/18 tasks, 0 cached |
| Typecheck | **PASS** | 18/18 tasks, 0 cached |
| Build | **PASS** | 11/11 tasks, 0 cached |
| Tests | **PASS, with the caveat below** | Direct invocation, `DATABASE_URL` exported: API suite 129 pass / 0 fail / 0 skipped, 33.4 s, 12 of 12 runs (one run failed once; see RT2-005). `TURBO_FORCE=true pnpm test`: 18/18 tasks, 0 cached, but see below. |
| Docker E2E (mobile) | **PASS** | 28 passed, 0 skipped |
| Original reproductions | **PASS** | 13/13 |

**Read the Tests row carefully.** `pnpm test` does not run any database-backed test.
Turbo 2.10.8 uses `envMode: strict` and the `test` task declares no `env`, so
`DATABASE_URL` is stripped and all 129 `if (!process.env.DATABASE_URL) return;` guards
fire. The API suite then reports `127 pass / 2 skipped` in **2.2 s**, versus **33.4 s**
and `129 pass` when the package script is invoked directly with the variable exported.
`TURBO_FORCE=true` defeats the cache but not the env stripping. Without forcing, turbo
replays `18 cached, 12 ms >>> FULL TURBO` and starts no process at all.

Every database-backed result in this report was obtained by invoking the package script
directly. Treat any `pnpm test` result as covering the pure-function packages only.

---

## Pilot readiness

| Label | Status |
|---|---|
| READY FOR CONTROLLED REAL-DATA PILOT | **No** (FAIL) |
| READY FOR PUBLIC PRODUCTION | **No** (separate scope, unchanged) |

### Blocking before a pilot

1. RT2-001 — stop taking the absolute value of liability balances in net worth and debt aggregation.
2. RT2-002 — honour `Idempotency-Key` on `POST /vehicles` and `POST /accounts`.
3. RT2-003 — stop letting the synthesised natural-key `externalId` refuse a genuinely new command.
4. RT2-006 — guard `db:reset` and give the test environment its own named database.

### Strongly recommended before a pilot

5. RT2-004 — assert page-specific content in the mobile specs so a 404 fails.
6. RT2-005 — isolate the test environment (see `TEST_ENVIRONMENT_ISOLATION.md`).
7. RT2-007 — upgrade `drizzle-orm` to ≥ 0.45.2.

---

## Sign-off

| Field | Value |
|---|---|
| Re-acceptance result | **FAIL** |
| Original blockers remaining | 0 |
| Original highs remaining | 0 |
| New blockers | 2 |
| New highs | 4 |
| Auditor | Cloud agent, independent adversarial run |
| Changes in this PR | Documentation only |
