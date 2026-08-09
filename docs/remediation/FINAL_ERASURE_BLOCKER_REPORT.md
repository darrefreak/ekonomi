# Final Erasure Blocker — Distinguish Object Absence From Bucket Failure

**Date:** 2026-08-09
**Branch:** `cursor/final-erasure-blocker-9c58`
**Scope:** FIR-001 only, from
[`V1_FINAL_INVARIANT_REACCEPTANCE.md`](../acceptance/V1_FINAL_INVARIANT_REACCEPTANCE.md).
**Explicitly out of scope:** everything else, including FPR-004; no unrelated
storage code was refactored.

This report records what changed and how it was verified. It does **not** declare
pilot readiness.

---

## Verdict table

| Item | Result |
|---|---|
| FIR-001 | **PASS** |
| `NoSuchBucket` classification | **PASS** |
| `NoSuchKey` classification | **PASS** |
| Fail-closed | **PASS** |
| Locator preservation | **PASS** |
| Retry | **PASS** |
| Sensitive object absence after COMPLETED | **PASS** |
| Currency regression | **PASS** — 23 / 23 and 27 / 27 |
| Financial oracle | **PASS** — 12 / 12 |
| FPA-002 | **PASS** — 14 / 14 and 10 / 10 |
| FPA-003 | **PASS** — 17 / 17 |
| Build | **PASS** |
| Lint | **PASS** |
| Typecheck | **PASS** |
| Tests | **PASS** — 226 tests, 136 database-backed |
| E2E | **PASS** — 59 passed, desktop and mobile |
| Docker | **PASS** |
| **Remaining BLOCKER** | **0** |
| **Remaining HIGH** | **0** |

`reacceptance-adversarial.py` still reports 15 / 17; both marks are the
previously documented RA-405 (superseded) and RA-406 (FPR-004, out of scope).
Neither probe was modified.

---

## 1. The reproduction, and the error shapes behind it

The failure, before the fix:

```
1. object really uploaded to ffos:   present
2. erasure ->                        201  status completed  objectsRemoved 1
3. object still in the real bucket:  STILL PRESENT
4. marker still readable:            True
5. locator rows left: 0              household rows: 0
```

The cause is not a logic slip so much as a protocol fact that had been guessed
at rather than measured. `apps/api/src/storage/error-shapes.probe.ts` was written
to ask MinIO directly, and it is kept so the next person does not have to guess
either:

| request | bucket exists, key absent | bucket absent | bad credentials |
|---|---|---|---|
| `HeadObject` | `name: NotFound`, 404, **no code** | `name: NotFound`, 404, **no code** | `name: Unknown`, 403, no code |
| `DeleteObject` | **204, no error at all** | `Code: NoSuchBucket`, 404 | `Code: InvalidAccessKeyId`, 403 |

Two things follow, and between them they are the whole fix:

- **A HEAD cannot tell a missing key from a missing bucket.** The response has no
  body, so the S3 error code is absent and both arrive as an identical bare 404.
  Any code that concludes "the object is gone" from a HEAD 404 is guessing.
- **A successful `DeleteObject` proves nothing.** It answers 204 whether or not
  the key was ever there.

---

## 2 & 3. Classification, and a narrow `isMissingObject`

`apps/api/src/storage/storage-errors.ts` is new and classifies every storage
failure into one of six kinds: `OBJECT_NOT_FOUND`, `BUCKET_NOT_FOUND`,
`ACCESS_DENIED`, `BACKEND_UNAVAILABLE`, `TIMEOUT`, `UNKNOWN_STORAGE_ERROR`.

Explicit S3 codes win, because they come from the service and say what happened:
`NoSuchBucket` → `BUCKET_NOT_FOUND`, `NoSuchKey` → `OBJECT_NOT_FOUND`,
`InvalidAccessKeyId` / `AccessDenied` / `SignatureDoesNotMatch` →
`ACCESS_DENIED`. Socket-level codes and wrapped causes map to
`BACKEND_UNAVAILABLE` or `TIMEOUT`. Only when no code is available is the HTTP
status read, and then strictly in the context of what was being asked — which is
what the `subject: "bucket" | "object"` parameter is for.

`isMissingObject` is replaced by `isObjectAbsence(kind)`, which is true for
exactly one kind. `NoSuchBucket` returns false, as do 403, 5xx, timeouts and
anything unclassifiable.

---

## 4, 5 & 6. The bucket is the authority, and it is checked first

Because a HEAD 404 is ambiguous, the bucket is established with its own request
before any conclusion is drawn about a key. Each deletion is now four steps:

1. `HeadBucket` — a 404 here can only be about the bucket. Missing bucket,
   denied, or unreachable: `FAILED`, and the erasure stops having removed
   nothing.
2. `HeadObject` — now unambiguous. Absent → `ALREADY_ABSENT_CONFIRMED`.
3. `DeleteObject`.
4. `HeadObject` again — the delete has to be shown to be true.

The locator's bucket is used, never the configured default: `bucket || this.bucket`
became `bucket || ""`, and a locator with a key but no bucket is a `FAILED` with
"the object's storage authority is unknown" rather than a guess. No row in the
database is in that state — every document with a storage key records its bucket
— but it is the difference between a rule and a coincidence.

`objectExists` was given the same two-step treatment, so it too cannot mistake a
missing bucket for a missing object.

---

## 7, 8 & 9. What the counts now mean

The outcome type became `DELETED_CONFIRMED | ALREADY_ABSENT_CONFIRMED | FAILED`.
Both successes mean the owning backend says the object is not there; they are
kept apart because they are different facts.

`objectsRemoved` counts only `DELETED_CONFIRMED` — objects this run deleted and
then confirmed gone. `objectsAlreadyAbsent` is reported alongside it. An object
that was never written is no longer counted as removed:

```
a completed erasure never counts an object it did not remove
  → status completed, objectsRemoved 0, objectsAlreadyAbsent 1
```

This also closes FIR-002. The previous contract documented a `NOT_FOUND` state
that the implementation could not reach, because idempotent `DeleteObject` made
everything look deleted. The pre-delete existence check is what makes the
distinction real, and it is safe precisely because the bucket has already been
established.

---

## 10 – 15. The required tests

`apps/api/src/storage/bucket-authority.integration.test.ts` runs against the
development MinIO rather than a double, because the defect was in how the SDK's
answers were read and a double would only replay the same assumptions.

| § | Test | Result |
|---|---|---|
| 10 | locator names a bucket that does not exist | `FAILED` / `BUCKET_NOT_FOUND`; erasure refuses, locator kept, object untouched, retry after repair completes |
| 11 | default bucket renamed to `ffos-new`, locator says `ffos` | deletes from `ffos`, the recorded authority |
| 12 | bucket exists, key genuinely absent | `ALREADY_ABSENT_CONFIRMED` — a good erasure |
| 13 | endpoint unreachable | `FAILED`, unavailability |
| 14 | credentials that cannot delete | `FAILED` / `ACCESS_DENIED`, object still there afterwards |
| 15 | repair the locator and retry | `completed`, `objectsRemoved 1`, object gone |
| 17 | three objects, all confirmed absent after `completed` | passes |

`apps/api/src/storage/storage-errors.test.ts` covers the classifier itself with
the shapes copied from the probe output, including the two byte-identical
`NotFound` errors that only the question distinguishes.

The end-to-end reproduction now reads:

```
1. object uploaded to ffos:                   present
2. erasure ->                                 503 ERASURE_STORAGE_UNAVAILABLE
3. object still in the real bucket:           present
4. locator rows: 1  household rows: 1  request: failed
5. retry with the locator repaired ->         201 completed  objectsRemoved 1
6. marker readable after COMPLETED:           False   household rows: 0
```

---

## 16 & 17. Locator durability and a provable COMPLETED

Ordering is unchanged and remains the safety mechanism: objects are removed and
confirmed before any row is touched, so the locator outlives every failure. What
changed is that far more failures are now recognised as failures.

The §17 invariant is a test rather than a persisted manifest, deliberately. A
durable manifest would have to record household-scoped storage keys against the
erasure request, which is the one thing the privacy policy says must not survive
an erasure. Instead the test holds the manifest in memory across the operation
and asserts, for a `completed` erasure of a household with three objects, that
every one of them is confirmed absent on its own backend.

---

## 18. Mutation testing

Both guards were broken deliberately to prove the tests detect the regression,
then reverted.

| Mutation | Result |
|---|---|
| `NoSuchBucket` classified as `OBJECT_NOT_FOUND` again | the classifier unit test fails |
| the `HeadBucket` step skipped in `deleteObject` | 2 of 10 integration tests fail, including the erasure-level one |

Worth noting what the first mutation did *not* break: the integration tests
still passed, because the bucket is established by a bucket-subject request and
that path never consults the `NoSuchBucket` branch. That is defence in depth
behaving as intended rather than a gap — and it is why the second mutation, which
removes the bucket check itself, is the one that reproduces FIR-001 end to end.

`git grep MUTATION` is clean.

---

## 19 & 20. Probes and regression

No probe was modified: `git diff` against the re-acceptance commit over
`scripts/pilot/` is empty.

| Probe | Result |
|---|---|
| `invariant-reacceptance.py` | **27 / 27** — was 25 / 27; IRA-301 and IRA-302 now pass |
| `currency-invariant.py` | 23 / 23 |
| `erasure-invariant.py` | 14 / 14 |
| `erasure.py` | 21 / 21 |
| `currency-legacy.py` | 11 / 11 |
| `budget-bootstrap.py` (FPA-003) | 17 / 17 |
| `production-secret.py` (FPA-002) | 14 / 14 |
| `reacceptance-secret.py` | 10 / 10 |
| `accounting-integrity.py` | 12 / 12 |
| `pilot-journey.py` | 15 / 16 (PILOT-002 / RT-010, LOW) |
| `security-probe.py` | 16 / 18 (SEC-011 MEDIUM, SEC-014 dev rate-limit config) |
| `data-robustness.py` | 7 / 8 (ROB-004 MEDIUM) |
| `open-findings.py` | 3 / 12 (carried-over MEDIUM/LOW) |
| `reacceptance-adversarial.py` | 15 / 17 — RA-405 superseded, RA-406 is FPR-004 |

Gates: build, lint and typecheck clean; 226 tests with 0 failures and 136
database-backed (was 208 / 133); 59 E2E on desktop and mobile; Docker stack
rebuilt and healthy.

---

## Not done, on purpose

- Nothing outside FIR-001 was touched. No unrelated storage code was refactored;
  `putObject`, `getSignedGetUrl` and the local driver's read path are unchanged.
- FPR-004 is still open and still out of scope.
- No probe was edited to match the implementation.
- No real-data pilot was started.

The next step is **RUN FINAL PILOT GO/NO-GO**.
