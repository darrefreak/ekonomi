# V1 Final Invariant Re-acceptance

**Date** 2026-08-09
**Question** Are the two invariants actually invariant?
**Scope** the currency invariant and the erasure-completion invariant claimed by
[`FINAL_INVARIANT_BLOCKERS_REPORT.md`](../remediation/FINAL_INVARIANT_BLOCKERS_REPORT.md).
No other finding was re-audited.
**Under test** `cursor/final-invariant-blockers-9c58` @ `b3248f3`, in the Docker
stack rebuilt from that commit.

## Verdict

> ### FAIL — do not start a real-data pilot yet
>
> **1 BLOCKER, 0 HIGH.**
>
> The currency invariant is real. It held against fourteen money-writing
> endpoints it had never been tested through, each aimed at a quarantined
> account of the exact type the endpoint expects, and left no posting behind.
> FPR-001 and FPR-002 are closed.
>
> The erasure invariant is not yet real. It holds when the object store is
> down — the case it was built for — but an object whose recorded bucket does
> not exist is still reported as confirmed gone. A document survives its own
> erasure, the erasure says `completed`, and the row holding the storage key is
> destroyed. That is FPR-003's harm reached through a different 404.

| Blocker | Claimed | Re-acceptance |
|---|---|---|
| FPR-001 the product offers a currency it then refuses to serve | fixed | **PASS** |
| FPR-002 an excluded account stays writable | fixed | **PASS** |
| FPR-003 erasure reports success while the object survives | fixed | **FAIL** — FIR-001 |

| | |
|---|---|
| Currency household invariant | **PASS** |
| Currency account invariant | **PASS** |
| Deep ledger currency invariant | **PASS** — 14 endpoints, 0 postings written |
| Legacy quarantine | **PASS** |
| Migration remediation | **PASS** — including the archived-money case |
| Independent accounting oracle | **PASS** — 12 / 12, `ACC-005` clean |
| Erasure fail-closed on outage | **PASS** |
| Erasure retry | **PASS** |
| Erasure false `completed` impossible | **FAIL** — FIR-001 |
| FPA-002 regression | **PASS** — 14 / 14 and 10 / 10 |
| FPA-003 regression | **PASS** — 17 / 17 |
| Original pilot probes | **53 / 66**, unchanged |
| Build / lint / typecheck | **PASS** |
| Tests | **PASS** — 0 failures, 133 database-backed |
| E2E | **PASS** — 59 passed, desktop and mobile |
| Docker | **PASS** |
| **Remaining BLOCKER** | **1** |
| **Remaining HIGH** | **0** |

Findings in full: [`V1_FINAL_INVARIANT_REACCEPTANCE_FINDINGS.md`](./V1_FINAL_INVARIANT_REACCEPTANCE_FINDINGS.md).

---

## How this was run

The remediation's claim was that these are invariants rather than patches, so
the audit was built to find the boundary case each guard had not been shown.

For currency that meant the endpoints nobody had aimed at a bad account. The
remediation's probes use income, expenses and transfers; the product has eleven
more ways to write a posting. Each attack here uses a quarantined account **of
the type the endpoint expects** — an EUR `CREDIT_CARD` for the card endpoints,
an EUR `MORTGAGE` for the mortgage endpoint, an EUR `LOAN` for the financed
purchase — so that the pre-existing account-type check cannot be mistaken for
the currency guard doing its job.

For erasure it meant the failure that is not an outage. The remediation proved
the behaviour with MinIO stopped; this asks what happens when MinIO is running
perfectly and the object's recorded bucket is simply not the one it is in.

Probe integrity was checked before anything else:

```
$ git diff --stat 8c781c9 HEAD -- <the five original probes>
(no output)
$ git diff --stat a8c4e18 HEAD -- scripts/pilot/reacceptance-adversarial.py
(no output)
```

`reacceptance-secret.py` has four lines added, disclosed in the remediation
report: it now sets `JWT_REFRESH_SECRET` explicitly because Compose interpolates
from the calling shell before `.env`. RA-208 still overrides it with the
placeholder, so no assertion is weakened.

---

## Currency — PASS

Fourteen attacks, all refused, and the positive control still books:

```
[PASS] IRA-101 a credit-card purchase on a quarantined card: 409 ACCOUNT_CURRENCY_QUARANTINED
[PASS] IRA-104 a mortgage payment against a quarantined mortgage: 409
[PASS] IRA-105 an investment transfer into a quarantined depot: 409
[PASS] IRA-110 a financed purchase against a quarantined loan: 409
[PASS] IRA-113 an event cannot be reclassified onto a quarantined account: 409
[PASS] IRA-114 a vehicle cannot be bought from a quarantined account: refused
[PASS] IRA-112 an ordinary expense on a good account still books: 201
[PASS] IRA-115 after fourteen attempts not one posting sits in the wrong currency
[PASS] IRA-116 reconciliation and every aggregate still work with six quarantined accounts present
```

This is what enforcing a rule at the boundary buys: the guard was written once,
at the two places postings are written, and it covers endpoints its author never
enumerated — including the reclassification path, which rebuilds postings for an
event that already exists.

The migration remediation also holds, including the case I expected to break it.
`openAccounts` counts only non-archived accounts, so a legacy household whose
only account is archived and holds money *can* be migrated. It is safe anyway,
because migration changes the household's base currency and the system books but
never a user account's currency: the archived EUR account becomes quarantined and
stays out of the totals. Net worth after migration is 0, not 100.

---

## Erasure — FAIL

What works: an unreachable object store aborts the erasure with `503`, removes
nothing, leaves the request `failed` and the locator intact, and the retry
completes once storage is back. The same is true of `DELETE /privacy/me`, which
the remediation's own outage probe did not cover. A cancelled request cannot be
executed.

What does not: an object whose recorded bucket does not exist.

```
1. object really uploaded to ffos:   present
2. erasure ->                        201  status completed  objectsRemoved 1
3. object still in the real bucket:  STILL PRESENT
4. marker still readable:            True
5. locator rows left: 0              household rows: 0
```

`NoSuchBucket` is an HTTP 404, and the delete path treats any 404 as "the object
is not there" — so the delete is swallowed, the read-back 404s for the same
reason, and the read-back is taken as confirmation. The container being absent
is read as the contents being absent.

The remediation brief is explicit that `NOT_FOUND` counts as success "only if
absence is confirmed on the authoritative backend", and a bucket that does not
exist confirms nothing. The acceptance criterion "erasure false COMPLETED:
IMPOSSIBLE" is not met.

A second, smaller consequence of the same conflation: `DeleteObject` is
idempotent on S3, so an object that was never written also reports `DELETED`.
`NOT_FOUND` is unreachable for any S3-backed object, and `objectsRemoved`
therefore counts things that were never there (FIR-002).

---

## The financial core

Untouched and correct. The oracle passes 12 / 12 after all fourteen currency
attacks, including the check that failed two audits ago:

```
[PASS] ACC-005 every posting matches its account's currency: postings whose currency differs from the account 0
[PASS] ACC-010 double-entry identity holds per household: breaks none
[PASS] ACC-011 product net worth equals opening positions plus income minus expenses: delta 0
```

The oracle was not modified and still derives its figures from the double-entry
identity rather than from product aggregation.

---

## Regression

| Probe | Result |
|---|---|
| `accounting-integrity.py` | 12 / 12 |
| `pilot-journey.py` | 15 / 16 (PILOT-002 / RT-010, LOW) |
| `security-probe.py` | 16 / 18 (SEC-011 MEDIUM, SEC-014 dev rate-limit config) |
| `data-robustness.py` | 7 / 8 (ROB-004 MEDIUM) |
| `open-findings.py` | 3 / 12 (carried-over MEDIUM/LOW) |
| `currency-legacy.py` | 11 / 11 |
| `budget-bootstrap.py` (FPA-003) | 17 / 17 |
| `erasure.py` | 21 / 21 |
| `currency-invariant.py` | 23 / 23 |
| `erasure-invariant.py` | 14 / 14 |
| `production-secret.py` (FPA-002) | 14 / 14 |
| `reacceptance-secret.py` | 10 / 10 |
| `reacceptance-adversarial.py` | 15 / 17 — RA-405 superseded, RA-406 is FPR-004 |

Gates: build, lint and typecheck clean; the suite runs with 0 failures and 133
database-backed tests; 59 E2E pass on desktop and mobile; the Docker stack is
healthy.

---

## What the next remediation should not do

- Do not fix FIR-001 by making `deleteObject` throw on every 404. A key that is
  genuinely absent from a bucket that genuinely exists is a legitimate
  `NOT_FOUND` and must stay one, or every retry of a partially completed erasure
  will fail forever.
- Do not fix it in `removeStoredObjects`. The conflation is in the storage
  service, which is where the backend's answers are interpreted.
- Do not widen the scope. FPR-004 is still open and still out of scope; the
  currency work needs nothing further.
- Do not edit `reacceptance-adversarial.py`. Its two red marks are understood
  and documented.

---

## Reproducing this verdict

```bash
docker compose up -d --build
python3 scripts/pilot/invariant-reacceptance.py   # 27 checks, 25 pass, 2 fail
python3 scripts/pilot/currency-invariant.py       # 23 / 23
python3 scripts/pilot/erasure-invariant.py        # 14 / 14
python3 scripts/pilot/accounting-integrity.py     # 12 / 12
```

IRA-301 and IRA-302 are the two failures, and both are FIR-001.
