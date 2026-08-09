# V1 Final Pilot Acceptance

**Date** 2026-08-09
**Question** Is this system ready for a controlled pilot with real household
financial data?

## Verdict

> ### FAIL — do not start a real-data pilot yet
>
> **2 BLOCKER, 2 HIGH** must be resolved first. All four are narrow and
> well-understood; none of them is in the financial engine.
>
> The financial core, which is what the last three audits kept failing on, is
> now independently correct. That is a real change and it is documented below
> with evidence that does not come from the product's own arithmetic.

| | |
|---|---|
| Financial correctness | **PASS** — verified against an independent derivation |
| Multi-tenant isolation | **PASS** — 37 surfaces, no leaks |
| Build / lint / typecheck / tests | **PASS** |
| Participant-triggerable data loss of function | **FAIL** — FPA-001 |
| Deployment security controls | **FAIL** — FPA-002 |
| Feature reachability for real households | **FAIL** — FPA-003 |
| Legal obligations (erasure) | **FAIL** — FPA-004 |

Findings in full: `V1_FINAL_PILOT_ACCEPTANCE_FINDINGS.md`.

---

## Why this audit was run differently

Every prior audit verified net worth by summing balances per account type. So
does the product. So do the oracles added during RT2 remediation. RT2-001 is
what that costs: five surfaces, a metric registry and a full test suite all
agreed on a number that was wrong, because they shared one misconception about
what a liability balance means.

An audit that repeats that shape of arithmetic cannot detect that class of
error, however many surfaces it checks. So the financial verification here is
derived from the double-entry identity instead:

> For any entry, debits equal credits. Assets contribute `debit − credit` to net
> worth. A liability's balance moves by `credit − debit` and net worth subtracts
> it, so liabilities contribute `debit − credit` as well. Balance-sheet accounts
> are therefore uniform, and since the entry sums to zero:
>
> **Δ net worth = income − expenses**

Net worth must equal opening positions plus every krona of income minus every
krona of expense, with no account-type bucketing anywhere in the derivation. A
sign error on liabilities breaks it. A dropped posting breaks it. An unbalanced
entry breaks it.

The same principle governs the rest: the security probe uses a real registered
intruder rather than an anonymous one; the journey probe builds a household from
zero rather than reading the seeded demo; the robustness probe enters what a
participant would enter rather than what the product expects.

---

## Probes written for this audit

All under `scripts/pilot/`, all runnable independently.

| Probe | Asks |
|---|---|
| `accounting-integrity.py` | Does the ledger obey double-entry, and does the product's net worth follow from income minus expenses? |
| `pilot-journey.py` | Can a new participant get from registration to a working household, and is every figure right on the way? |
| `security-probe.py` | Can a registered stranger reach anything at all? |
| `data-robustness.py` | What happens when a participant enters something unexpected? |
| `open-findings.py` | Do the deferred findings still reproduce on a real household? |

---

## Results

### Financial correctness — PASS

`accounting-integrity.py`: **12 / 12**

| Check | Result |
|---|---|
| Every ledger entry balances | 0 unbalanced |
| No non-positive, single-sided, orphaned or cross-household postings | 0 of each |
| Nominal and balance-sheet accounts do not overlap | clean |
| No money column stored as a float | none |
| `Δ(assets − liabilities) = income − expenses`, per household | holds for all **23** households present |
| Product net worth = opening + income − expenses | delta **0** |
| Every step of the net worth history equals that period's income minus expenses | 5 / 5 steps |

The identity was re-checked after the end-to-end suites had written to the
database, and it still held for all 23 households — including the ones this
audit deliberately broke with a foreign-currency account (FPA-001). That is a
useful nuance: the currency defect lives in the aggregation guard, not in the
ledger. No data is corrupted by it.

The strongest single piece of evidence for RT2-001 comes from outside this
work entirely. The pristine demo net worth is now **549 834 768 öre** — exactly
the figure the RT2 red team computed independently, before any fix existed, as
what the product *should* have been reporting. An outside party's number,
derived before the fix, matched to the öre afterwards.

A note on reproducing that figure: `scripts/rt-repro.py` books 11 100 + 22 200 +
10 100 = 43 400 öre of probe expenses into the demo household, so after it runs
the demo reads `549 791 368`. Both numbers are correct; they are measured at
different points.

`pilot-journey.py` confirms the same arithmetic on a household with no seeded
history, at every step:

| Step | Expected | Reported |
|---|---|---|
| Five opening positions | −180 590 000 | −180 590 000 |
| After salary, rent, groceries, a card purchase and a mortgage payment | −179 440 000 | −179 440 000 |
| Principal portion of the mortgage payment | net worth unchanged | unchanged |
| Debt shown after 5 000 kr principal | 184 500 000 | 184 500 000 |
| After onboarding a vehicle at 160 000 kr | −163 440 000 | −163 440 000 |
| Dashboard, `/net-worth` and metric registry | all equal the independent oracle | all equal |

### Multi-tenant isolation — PASS

`security-probe.py`: 14 / 18, with all four failures outside tenancy.

Two households were created with distinct amounts and an unrelated registered
user attempted to reach one from the other.

| Attack | Result |
|---|---|
| 37 surfaces unauthenticated | all 401 |
| 36 surfaces with a valid token and someone else's `householdId` | no leaks |
| Foreign transaction, account and debt fetched by identifier | all refused |
| Writes into the victim household (account, expense, vehicle, data export) | all refused |
| Victim household afterwards | 1 account, 1 event — provably untouched |
| `alg=none`, rewritten subject, forged signature, garbage, Basic auth | all rejected |
| Refresh token used as an access token | 401 |
| Injection payloads in query parameters | no server errors, schema intact |
| Error responses | no stack traces, SQL or connection strings |
| Login for a wrong password vs an unknown account | identical |
| Password storage | bcrypt, cost 12 |
| Security headers | CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options` all present |

### Recovery — mechanism PASS, procedure FAIL

The restore drill that RT-015 says had never been run was performed:

| Check | Result |
|---|---|
| `pg_dump -Fc` restored into a scratch database | completed |
| Row counts and Σ posting amounts before / after | `18/13/62/338/706/31033911224` — identical |
| Unbalanced entries in the restored copy | 0 |
| Households breaking the accounting identity in the restored copy | 0 |

Recovery works and preserves integrity. What is missing is tooling, scheduling,
offsite storage and a rehearsed procedure — see FPA-008.

### Gates

| Gate | Result |
|---|---|
| `pnpm build` | PASS — 11 tasks |
| `pnpm lint` | PASS — 18 tasks |
| `pnpm typecheck` | PASS — 18 tasks |
| `pnpm test` | PASS — 277 tests, **106 database-backed and counted** |
| `pnpm test:e2e:docker` | PASS — 53 passed, 10 skipped, 0 failed |
| `pnpm test:e2e:docker:mobile` | PASS — 30 passed, 2 skipped, 0 failed |

`pnpm test:e2e` cannot run directly on this host: Playwright 1.62.1 requires
`libatk-1.0.so.0`, which is not installed. The repository's supported path for
this environment is `pnpm test:e2e:docker`, which is what was used.

### Prior remediation, re-verified

The existing harnesses were re-run after the end-to-end suites, on a database
that had been written to — the state in which a regression would show:

| Harness | Result |
|---|---|
| `scripts/rt-repro.py` — original red team reproductions | **13 / 13** |
| `scripts/rt2-repro.py` — RT2 reproductions | **21 / 21** |
| `scripts/financial-oracle.py` — five-surface oracle | **15 / 15** |
| `scripts/pilot/accounting-integrity.py` — this audit's independent derivation | **12 / 12** |

---

## What blocks the pilot

Four findings, none in the financial engine.

### FPA-001 (BLOCKER) — a foreign-currency account permanently breaks the household

The account form offers a currency selector. Choosing EUR is accepted (`201`).
The dashboard, net worth, insights, forecast, metric registry, debt and
investments then all return **500**, permanently. Deleting the account returns
`200` and changes nothing, because archived accounts are still fed to the
currency guard. The participant has no way back.

The SEK-only limitation is a defensible V1 scope decision. Accepting data that
violates it, failing with an unhandled error afterwards, and offering no
recovery is not.

### FPA-002 (BLOCKER) — the production secret guard accepts the placeholder this repository publishes

`requireAccessSecret` refuses a missing or short secret in production, but
checks length only. The placeholder in `docker-compose.yml` and `.env.example`
is `dev-access-secret-change-me` — 27 characters, so it passes. A token signed
with that public string was accepted by the running API and used to read a
household's net worth.

The guard exists to prevent exactly this deployment mistake and does not detect
it. There is no production deployment descriptor to use instead: the only one in
the repository ships the placeholder secrets and a rate limit sixteen times the
product default.

### FPA-003 (HIGH) — Budget is unreachable for every real household

`GET /budget` returns `404` unless a `budget_periods` row exists, and only the
demo seed ever creates one. This was recorded as an empty-household edge case
and deferred as MEDIUM; it is not an edge case. It reproduces on a fully
populated household and no participant action can ever clear it. Budget is a
primary navigation entry, so every participant will reach an error screen.

### FPA-004 (HIGH) — the right to erasure is not implemented

`POST /privacy/delete-request` records a row with status `requested`. Nothing
ever processes it — no job, no admin endpoint, no script — and there is no route
to delete a household or a user at all. For real Swedish household financial
data, accepting an erasure request and never acting on it is worse than
refusing it. Export works correctly.

---

## Findings that do not block, but should be known

| ID | Severity | Summary |
|---|---|---|
| FPA-005 | MEDIUM | Amounts above the column maximum return `500` instead of `400`; the maximum itself is accepted |
| FPA-006 | MEDIUM | Password policy is length-only; `password` is accepted |
| FPA-007 | MEDIUM | The only deployment descriptor is a dev stack: `FFOS_RATE_LIMIT: "2000"` and placeholder secrets |
| FPA-008 | MEDIUM | No backup tooling, schedule or runbook, though the mechanism is proven to work |
| FPA-009 | LOW | Logout revokes refresh tokens only; an access token stays valid for up to 15 minutes |
| FPA-010 | LOW | `JWT_REFRESH_SECRET` is configured but never read |

All ten findings deferred by earlier audits still reproduce, re-measured on a
household built the way a participant builds one: RT-006, RT-007, RT-008,
RT-009, RT-010, RT-011, RT-014, RT2-009, RT2-010, and RT-013 (still not
reproduced, still not evidence of a fix). RT-005 is escalated to FPA-003.

Of these, the two that most affect a pilot are **RT-011 / RT-007** — a mistyped
amount is accepted without challenge and drives balances deeply negative — and
**RT-008**, which shows a permanent, meaningless `MISMATCH` on four of five
manually maintained accounts.

---

## What changed since the last audit

The previous verdict (`V1_RED_TEAM_REACCEPTANCE.md`) was FAIL on 2 BLOCKER and
4 HIGH, all financial or test-trust. Those are genuinely resolved, and this
audit confirms them by independent derivation rather than by re-running the
remediation's own checks:

| Prior finding | Confirmed by |
|---|---|
| RT2-001 liability sign semantics | `ACC-010`…`ACC-012`; demo net worth matches the red team's independent expectation to the öre |
| RT2-002 command idempotency | `pilot-journey.py` creates accounts and vehicles with idempotency keys throughout |
| RT2-003 command vs source identity | Distinct legitimate commands of the same shape are accepted |
| RT2-004 mobile 404 guard | Route identity assertions in the E2E suite |
| RT2-005 honest tests | 277 tests, 106 database-backed and counted |
| RT2-006 reset safety | Guard refuses protected, unknown and unconfirmed targets |
| RT2-008 snapshot identity | Unique index present; no duplicates |

The defects found now are of a different kind. The earlier ones were errors in
the arithmetic of money. These are gaps at the edges — data the product accepts
but cannot process, a safety guard that does not catch the case it was written
for, a feature with no way in, and an obligation with no implementation. That is
a healthier failure profile, but it is still a failure for real data.

---

## Recommendation

Fix FPA-001 and FPA-002, then FPA-003 and FPA-004. All four are contained:

- FPA-001 — validate currency at account creation, exclude archived accounts
  from the position query, and turn the engine's throw into a handled error.
- FPA-002 — reject known placeholder secrets explicitly, and add a production
  deployment descriptor that requires secrets to be supplied externally.
- FPA-003 — create a budget period on demand, or return an empty period.
- FPA-004 — implement erasure, or document and expose a manual procedure and
  stop reporting requests as accepted.

Then re-run the five probes in `scripts/pilot/`. They are written to be re-run.

Before the pilot proper, RT-011 and RT-007 deserve a decision even if the answer
is "accept": a participant who types one zero too many should not silently end
up with a net worth that is wrong by millions.

This audit does **not** claim public production readiness. External
integrations, monitoring, secret management, regulatory review and production
backup remain outside its scope.
