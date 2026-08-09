# V1 Final Invariant Re-acceptance — Findings

**Date** 2026-08-09
**Scope** the two invariants claimed by the invariant remediation — one financial
currency per household, and erasure completing only after confirmed deletion —
re-tested from directions the remediation's own probes did not use. Nothing else
was re-audited.
**Verdict document** [`V1_FINAL_INVARIANT_REACCEPTANCE.md`](./V1_FINAL_INVARIANT_REACCEPTANCE.md)
**Probe** `scripts/pilot/invariant-reacceptance.py`

## Severity definitions used here

| Severity | Meaning |
|---|---|
| BLOCKER | A participant can lose data, see wrong money, or be locked out of the product; or an outsider can reach their data. Pilot must not start. |
| HIGH | A participant reliably hits a dead end on an advertised feature, or a legal obligation is unmet. Needs a fix or a written, agreed workaround before the pilot. |
| MEDIUM | Degrades trust or robustness; tolerable in a supervised pilot with known participants. |

## Summary

| Finding | Severity | Belongs to |
|---|---|---|
| FIR-001 a stale bucket reference makes erasure report `completed` while the data survives | BLOCKER | FPR-003 not fully closed |
| FIR-002 `objectsRemoved` counts objects that were never there; `NOT_FOUND` is unreachable on the S3 path | MEDIUM | the same delete path |
| FIR-003 FPR-004 is still open, unchanged | LOW | out of scope by instruction |
| FIR-004 RA-405 is superseded by the fix, not failing because of it | observation | — |

**The currency invariant held against everything thrown at it.** Fourteen
money-writing endpoints, each aimed at a quarantined account of the correct
type, plus reclassification and vehicle purchase: all refused, no posting
written, oracle clean. That claim is genuinely enforced at the boundary.

---

## BLOCKER

### FIR-001 — A stale bucket reference makes erasure report `completed` while the data survives

**Severity** BLOCKER
**Belongs to** FPR-003, which is therefore not fully closed
**Probe** `invariant-reacceptance.py` IRA-301, IRA-302

The remediation established that an *unreachable* object store aborts the
erasure. It did not establish the same for an object whose recorded bucket does
not exist, and that case still produces the exact failure FPR-003 described.

Reproduced end to end. A document is uploaded normally to the real bucket, the
row's `bucket` is then pointed at a bucket that does not exist — a renamed
bucket, a changed `S3_BUCKET`, or a database restored into an environment whose
buckets are named differently — and the erasure is run:

```
1. object really uploaded to ffos:        present
2. erasure ->                             201  status completed  objectsRemoved 1
3. object still in the real bucket:       STILL PRESENT
4. marker still readable:                 True
5. locator rows left: 0                   household rows: 0
```

The personnummer is still readable in MinIO, the household and the `documents`
row that held the storage key are gone, and the request says `completed`. There
is nothing left to retry from and nothing left pointing at the object. That is
FPR-003's harm, reached through a different door.

**Mechanism.** `NoSuchBucket` is an HTTP 404, and `isMissingObject` treats any
404 as "the object is not there":

```173:178:apps/api/src/storage/object-storage.service.ts
  private static isMissingObject(err: unknown): boolean {
    const name = (err as { name?: string })?.name ?? "";
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode;
    return name === "NotFound" || name === "NoSuchKey" || status === 404;
  }
```

So the delete against a missing bucket is swallowed, the read-back also returns
404 because the bucket is still missing, and the read-back is interpreted as
confirmation that the object is gone. The container being absent is being read
as the contents being absent.

This is precisely the condition §13 of the remediation brief singles out:
`NOT_FOUND` is success "only if absence is confirmed on the authoritative
backend". A bucket that does not exist is not the authoritative backend
confirming anything.

**Why it is rated BLOCKER.** The harm is identical to the finding it descends
from — unrecoverable retention of personal data behind a false completion claim
— and FPR-003 was rated BLOCKER for exactly that. The mitigating factor, stated
plainly so the reader can calibrate: the routine failure, object storage being
down, is now handled correctly, and triggering this needs the recorded bucket to
be wrong. Against that: a bucket name is deployment configuration, the value is
stored per row, and nothing in the product can detect the mismatch — every
erasure would report success forever.

**Not prescriptive, but the shape of a fix.** Distinguish bucket-level errors
from object-level ones (`NoSuchBucket` is not `NoSuchKey`), and treat "the
bucket I was told about does not exist" as `FAILED`. Verifying the bucket once
per erasure with `HeadBucket` would also do it.

---

## MEDIUM

### FIR-002 — `objectsRemoved` counts objects that were never there

**Severity** MEDIUM
**Probe** observed while reproducing FIR-001

The remediation report states that `objectsRemoved` "counts confirmed
deletions, not keys that were looped over", and `docs/privacy/ERASURE.md`
documents a three-state contract of `DELETED` / `NOT_FOUND` / `FAILED`. Neither
is quite what the code does on the S3 path.

A document row whose key was never written to an existing bucket:

```
key missing, bucket exists    bucket=ffos    -> 201 status=completed objectsRemoved=1
```

`DeleteObject` on S3 is idempotent and does not fail for a missing key, so the
delete "succeeds", the read-back 404s, and the result is `DELETED`. `NOT_FOUND`
is therefore unreachable for any S3-backed object; it can only be returned when
the storage key is empty or the backend is local.

The safety property survives this — at the end of the call the object is
confirmed absent from that bucket, which is what completion needs — so this is
an honesty and diagnostics problem rather than a data-retention one. It matters
because the count is what an operator or an auditor reads to decide whether an
erasure did anything, and because the distinction the contract draws is the same
distinction FIR-001 turns on.

---

## LOW / observations

### FIR-003 — FPR-004 is still open

`RA-406` still reports one dangling `privacy.erasure_confirmed` audit row after
concurrent confirmations, payload `{"status": "confirmed"}`. The remediation
brief put it out of scope and it is unchanged. Recorded here only so the count
is not mistaken for a new regression.

### FIR-004 — RA-405 is superseded, not failing

`RA-405` asserts that no stored object outlives the erasure, and it never
retries after restarting MinIO. That encodes the pre-remediation behaviour where
the erasure claimed completion. The erasure now refuses, so after the probe's
single failed attempt the object correctly remains — and the probe's own output
confirms the new behaviour it was not written to expect:

```
[FAIL] RA-405 ... object in bucket after erasure: xl.meta, rows still pointing at it: 1
```

`rows still pointing at it: 1` is the locator being preserved, which is the
property that makes the retry possible. RA-404, the half that tests the claim
rather than the object, passes: `503`, household rows 1. The remediation left
the probe untouched and disclosed this, which is the right call; the successor
requirement is covered by `erasure-invariant.py` ERI-003…ERI-012.

---

## What was verified as genuinely working

### The currency invariant, attacked from fourteen directions

Every attack used a quarantined account **of the type the endpoint expects**, so
the account-type check could not be what refused it:

| Attack | Result |
|---|---|
| credit-card purchase on a quarantined card | `409 ACCOUNT_CURRENCY_QUARANTINED` |
| credit-card payment from a quarantined cash account | `409` |
| credit-card payment onto a quarantined card | `409` |
| mortgage payment against a quarantined mortgage | `409` |
| investment transfer into a quarantined depot | `409` |
| investment transfer out of a quarantined cash account | `409` |
| refund into a quarantined cash account | `409` |
| asset purchase from a quarantined cash account | refused |
| asset purchase into a quarantined asset account | `409` |
| financed purchase against a quarantined loan | `409` |
| depreciation of a quarantined asset | refused |
| reclassifying an existing event onto a quarantined account | `409` |
| buying a vehicle from a quarantined account | refused |
| an ordinary expense on a good account | `201` — the guard is not blanket |

After all of them: **zero** postings in a currency their account does not hold,
and reconciliation plus all six aggregate surfaces still answer with six
quarantined accounts present. The independent oracle passes 12 / 12 including
`ACC-005`.

### The migration remediation

| Attack | Result |
|---|---|
| migrate a household to an unsupported currency | refused |
| migrate a household that is already SEK | `changed: false`, no error |
| a stranger migrating someone else's household | `404` |
| migrate a legacy household whose only account is archived and holds money | the archived account keeps EUR; the foreign balance is not absorbed into the new total |

The archived-account case was the one I expected to find a hole in: `openAccounts`
counts only non-archived accounts, so the migration is allowed. It turns out to
be safe, because migration changes the household's base currency and the system
books, never a user account's currency — so the archived EUR account simply
becomes quarantined and stays out of the totals. Net worth after migration is 0,
not 100.

### The erasure paths that were fixed

| Attack | Result |
|---|---|
| storage down during a household erasure | `503`, nothing removed, request `failed`, retryable |
| storage down during `DELETE /privacy/me` | `503`, user still present, object and locator intact |
| the same user deletion once storage is back | succeeds, object gone |
| confirming a cancelled request | `409`, household intact |

The user-deletion path was not covered by the remediation's own outage probe and
it fails closed correctly, which is a real result rather than an accident: it
shares `removeStoredObjects` with the household path.
