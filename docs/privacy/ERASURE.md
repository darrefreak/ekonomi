# Erasure

What "delete my data" does, what it deliberately leaves behind, and why.

Before this existed, `POST /privacy/delete-request` wrote a row and nothing ever
read it again. The participant was told their request was on file; their
accounts, transactions and documents stayed exactly where they were. A promise
to erase that never erases is worse than no promise.

## Asking and doing are separate

| Status | Meaning |
|---|---|
| `requested` | The participant has asked. Nothing has been deleted. |
| `confirmed` | They typed the household's name back. Execution starts. |
| `processing` | Execution is under way. |
| `completed` | The household and its data are gone. |
| `failed` | Execution stopped. The request can be confirmed again to resume. |
| `cancelled` | Withdrawn before execution. It cannot be executed afterwards. |

Two steps, not one, because erasure cannot be undone and a single misplaced
click must not trigger it. Confirmation requires typing the household's name
exactly; anything else is refused with a `400` and nothing is touched.

Ownership is checked again at confirmation time, so a request made while
somebody was an owner does not still execute after they stopped being one.

- `POST /privacy/delete-request` — create the request (`requested`).
- `POST /privacy/requests/:id/confirm` — confirm and execute.
- `POST /privacy/requests/:id/cancel` — withdraw.
- `DELETE /privacy/me` — delete the signed-in user.
- `GET /privacy/erasable` — households this user owns.

In the product: **Inställningar → Integritet → Radera hushållet**.

## Completed means the data is gone

`completed` is a claim about the world, not about the attempt. It is only
written after the store that owns each object has confirmed the object is no
longer there.

This was not true at first. Object deletion was best-effort: if the object store
could not be reached, the code fell back to removing a local file that was never
there, counted it as removed, and went on to delete the row holding the storage
key. The erasure reported `completed` with `objectsRemoved: 1` while the
document sat in the bucket with nothing left pointing at it, and no retry was
possible because the request was finished and the locator was gone (FPR-003).

Three rules follow, and the code is arranged around them:

1. **The backend that owns the object is the one that must delete it.** Which
   backend that is comes from the `bucket` recorded when the object was stored,
   not from what this process can currently reach and not from whatever
   `S3_BUCKET` currently says. An object in MinIO is not deleted by removing a
   file from a local directory, however unavailable MinIO happens to be, and a
   locator naming bucket X is not satisfied by deleting from bucket Y. A locator
   with a key but no bucket names no authority at all, and fails.
2. **A deletion reports what it achieved, confirmed by reading back.**
   `deleteObject` returns `DELETED_CONFIRMED`, `ALREADY_ABSENT_CONFIRMED` or
   `FAILED`. Both successes mean the owning backend says the object is not
   there; a backend that does not answer, refuses, or does not have the bucket
   is `FAILED`, never "already gone".
3. **Only confirmed deletions are counted.** `objectsRemoved` counts objects
   this run deleted and then confirmed gone. Objects that were already absent
   are reported separately as `objectsAlreadyAbsent`, because "I removed it" and
   "it was not there" are different facts.

### Why the bucket is checked first

A second version of the same defect survived the first fix (FIR-001):
`NoSuchBucket` is an HTTP 404, and the code read any 404 as the object being
absent. A locator pointing at a bucket that no longer exists — renamed, or a
database restored into an environment that names buckets differently — reported
`completed` while the document sat untouched in the bucket it was actually in.

The shapes MinIO returns, measured rather than assumed
(`apps/api/src/storage/error-shapes.probe.ts`):

| request | bucket exists, key absent | bucket absent |
|---|---|---|
| `HeadObject` | `NotFound`, 404, no code | `NotFound`, 404, no code |
| `DeleteObject` | 204, no error | `NoSuchBucket`, 404 |

A HEAD response has no body, so the S3 error code is not there and the two
left-hand cases are indistinguishable. So absence of an object is never
concluded from a HEAD alone. Each deletion runs four steps:

1. `HeadBucket` — a 404 here can only mean the bucket, so a missing bucket is
   `BUCKET_NOT_FOUND` and the erasure stops.
2. `HeadObject` — now that the bucket is known to exist, a 404 unambiguously
   means the key is absent, and the object is `ALREADY_ABSENT_CONFIRMED`.
3. `DeleteObject`.
4. `HeadObject` again — the delete has to be shown to be true, not assumed.

Step 2 also exists because `DeleteObject` answers 204 whether or not the key was
there, so without a check beforehand a key that never existed would be counted
as one this erasure removed.

Failures are classified rather than guessed at: `OBJECT_NOT_FOUND`,
`BUCKET_NOT_FOUND`, `ACCESS_DENIED`, `BACKEND_UNAVAILABLE`, `TIMEOUT`,
`UNKNOWN_STORAGE_ERROR`. Only the first is absence. A 403 is not absence, and
neither is silence.

If any object cannot be confirmed gone, the erasure stops before touching a
single row and returns `503 ERASURE_STORAGE_UNAVAILABLE`. The household, the
documents and the storage keys are all still there, and the request is left
`failed` — which is retryable.

There is no transaction spanning Postgres and the object store, so the ordering
is the safety mechanism: objects are removed and confirmed first, and only then
are the rows that locate them deleted. A failure before that point leaves a
state that can be retried; there is no point at which a locator is destroyed
while its object survives.

## What a household erasure removes

Objects in storage first, then rows in one transaction:

1. **Object storage.** Every document's stored object is deleted from the
   bucket and confirmed gone. Deleting the database row alone would leave the
   file readable.
2. **The tables nothing cascades from.** `source_transaction_links` has a
   `household_id` but no foreign key to `households`, so it would otherwise be
   left pointing at a household that no longer exists.
3. **`audit_logs`.** Not deleted; anonymised. See below.
4. **The household row.** Fifty-odd tables declare
   `references households(id) on delete cascade`, so accounts, transactions,
   the ledger, metrics, budgets, goals, vehicles, documents, raw import
   records, connector state, recommendations, notifications, categories,
   merchants, memberships and invitations all go with it.
5. **The request itself.** Its `note` — which quotes the participant's own
   words — is cleared, and `household_id` becomes null when the household is
   deleted. What remains is a count of what was removed.

`scripts/pilot/erasure.py` asserts afterwards that no household-scoped row
survives, that no orphan points at the deleted household, that the object is
gone from the bucket, that the assistant and search cannot reach it, and that
no audit row still quotes the household's data.

`scripts/pilot/erasure-invariant.py` covers the other half — what happens when
the object store is unavailable at the moment of erasure — by stopping MinIO,
confirming the erasure refuses and keeps the locator, restarting it, and
checking that the retry completes and the sensitive marker is no longer
anywhere in the bucket.

`apps/api/src/storage/bucket-authority.integration.test.ts` runs the same
questions against real MinIO: a missing bucket, a missing key, a renamed default
bucket, credentials that cannot delete, an unreachable endpoint, and the
invariant that every object a completed erasure covered is confirmed absent.

## One storage service

`ObjectStorageService` is provided once, by a global `StorageModule`, and
imported wherever it is needed. `IntakeModule` and `PrivacyModule` each used to
declare it in their own `providers`, which asked Nest for two instances with two
independent views of whether the object store was reachable: uploads went to
MinIO through one, and the erasure path asked the other, got a different answer
and deleted nothing.

## Retrying

Erasure is retry-safe on purpose, because a run interrupted halfway must be
resumable and must not leave a household half-deleted:

- an object the owning backend confirms is absent counts as done, so a retry
  does not trip over its own earlier progress;
- the row deletion is a single transaction, so it either happened or it did not;
- a request whose household has already been deleted is reported as completed;
- every step only ever removes, so no retry can resurrect a deleted record.

A `failed` request can be confirmed again to resume, and simultaneous retries
are safe: six at once erase the household exactly once and leave one completed
request.

Retry-safety is not the same as never failing. The first version achieved
"always succeeds" by ignoring what the object store did, which is how a
completed erasure came to leave personal data behind. Failing loudly and staying
resumable is the property that was actually wanted.

## Deleting a user

`DELETE /privacy/me`, with behaviour defined for each case:

| The user is | What happens |
|---|---|
| in no household | the user is deleted |
| a member, or one of several owners | the user and their membership are deleted; the household continues |
| the sole owner, and the only member | the household is erased with them, because nobody could ever reach it again |
| the sole owner of a household others belong to | **refused** (`409 SOLE_OWNER_OF_SHARED_HOUSEHOLD`) — make someone else an owner, or erase the household first |

The refusal exists so a deletion cannot strand a household full of other
people's financial data with nobody able to read or delete it. Memberships,
refresh tokens and privacy requests cascade from `users`.

## What remains, and why

Erasure and audit pull in opposite directions. The position taken here is that
the *fact* that something happened is a security record worth keeping, while
*what* it was is the participant's data and goes.

After an erasure, an `audit_logs` row keeps its action, timestamp and actor. Its
`household_id`, `entity_id` and both the before and after states are set to
null. So the record shows that an account was created or a household erased,
never the balances, names or descriptions involved.

One row is added: `privacy.erasure_completed`, with the request id and counts.
It carries no household id and no personal data.

Nothing else is retained. In particular no financial payload is kept under the
heading of audit.

## The demo household

Outside production the seeded demo (`Familjen Demo`) is refused, because wiping
it breaks the fixtures every database-backed suite depends on. This is a
development convenience, not a security control: in production the only thing
between a household and erasure is ownership, exactly as it should be.

## Not a database reset

Erasure is scoped to one household and deletes rows. It shares nothing with the
schema-reset machinery: no `drop schema`, no `truncate`, no reuse of
`apps/api/src/db/reset.ts`. The reset guard described in
`docs/safety/DATABASE_RESET_GUARD.md` is unaffected and its tests still pass.
