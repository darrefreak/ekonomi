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

## What a household erasure removes

Objects in storage first, then rows in one transaction:

1. **Object storage.** Every document's stored object is deleted from the
   bucket. Deleting the database row alone would leave the file readable.
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

## Retrying

Erasure is retry-safe on purpose, because a run interrupted halfway must be
resumable and must not leave a household half-deleted:

- deleting an object that is already gone succeeds;
- the row deletion is a single transaction, so it either happened or it did not;
- a request whose household has already been deleted is reported as completed;
- every step only ever removes, so no retry can resurrect a deleted record.

A `failed` request can be confirmed again to resume.

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
