# Pilot Runbook

For whoever is operating the pilot. It assumes you can run commands in a
terminal in the project directory, and nothing else. You should not need to read
any source code to use this document.

Every command below is run from the project root, with the pilot environment
active:

```bash
export APP_ENV=pilot
```

If a command fails, it says why and stops. Nothing here silently continues.

---

## Before every session

```bash
pnpm pilot:preflight
```

This checks the things that must be true before real data is entered: the right
database, the right bucket, versioning off, real secrets, migrations current, a
writable backup destination, the API healthy. It prints what it found and exits
non-zero if anything mandatory is wrong.

**If preflight fails, stop.** Do not enter data. Fix what it named and run it
again. It never changes anything, so it is safe to run as often as you like.

Then take a backup:

```bash
pnpm backup:pilot
```

Wait for `BACKUP COMPLETE`. Anything else means you do not have a backup.

---

## Daily, while the pilot is running

```bash
pnpm pilot:check
```

Read-only. It repeats the safety checks, confirms a complete backup exists from
the last 24 hours, and looks at the ledger: every entry balancing, no posting in
the wrong currency, no orphaned rows, no erasure stuck in a failed state.

---

## Taking a backup

```bash
pnpm backup:pilot          # database and objects, tied together by one manifest
pnpm backup:postgres       # the database alone
pnpm backup:objects        # the documents alone
```

`backup:pilot` is the one to use. It dumps the database, copies every stored
document, records a SHA-256 checksum for each, verifies the dump is readable by
`pg_restore`, and only then writes `status: COMPLETE` in the manifest.

If any part fails, the whole backup is marked `FAILED` and the command exits
non-zero. A backup that is half-there is more dangerous than none, because it is
the one you would reach for in an emergency.

**When to back up**

- before every pilot session, without exception
- daily while real data exists, even on a day nobody used the product
- before any upgrade, migration or configuration change
- before deliberately testing anything destructive

---

## Verifying a backup

```bash
ls var/backups
cat var/backups/<backupId>/manifest.json
```

`status` must be `COMPLETE`. The manifest records when it was taken, in which
environment, at which commit, the database checksum and the object count.

To verify it can actually be restored — which is the only verification that
means anything — run a recovery into the isolated environment:

```bash
pnpm recovery:prepare <backupId>
```

---

## Restoring

Restores never touch the live pilot. Everything lands in a separate recovery
database and a separate recovery bucket.

```bash
pnpm recovery:prepare <backupId>     # or: latest
```

This validates the manifest and every checksum before writing anything, restores
the database into the recovery database, restores the objects into the recovery
bucket, replays every erasure recorded since the backup was taken, and then
checks the result: ledger balanced, currency invariant intact, no orphans, every
document resolving to an object, and no erased household coming back.

Individual steps, if you need them:

```bash
pnpm restore:postgres <backupId>
pnpm restore:objects <backupId>
```

**What "recovery prepared" means.** You have a verified copy alongside the live
system. The live pilot is unchanged and still running. Nothing has switched.

### Promoting a recovery

Promotion is deliberate, manual, and the only step that touches live data. Do it
only after `recovery:prepare` has succeeded and you have looked at the numbers.

1. Stop the application so nothing writes during the swap:
   `docker compose stop api worker web`
2. Take a backup of the current live state, even though you believe it is
   broken. You may need it to understand what happened:
   `pnpm backup:pilot`
3. Rename the databases, in psql as an administrator: the live database to
   `<name>_broken_<date>`, then the recovery database to the live name.
4. Copy the recovery bucket's contents over the live bucket with the AWS CLI, or
   repoint `S3_BUCKET` at the recovery bucket and update `FFOS_PILOT_BUCKET` to
   match.
5. `pnpm pilot:preflight` — it must pass before anything starts.
6. `docker compose start api worker web`
7. `pnpm pilot:check`
8. Write down what happened, what was promoted and what was lost.

Keep the broken database until you understand the incident.

---

## Stopping

```bash
docker compose stop api worker      # stop writes, keep reading impossible too
docker compose stop web             # stop the interface
docker compose stop                 # everything, including the database
```

Stopping `api` and `worker` is enough to guarantee nothing further is written.
There is no maintenance mode: stopping the API is the maintenance mode.

---

## STOP conditions

If any of these happens, **stop entering data immediately**. Do not try to fix
it by carrying on.

| What you see | Why it matters |
|---|---|
| the financial oracle fails | a figure somewhere is not derivable from the ledger |
| `pilot:check` reports an unbalanced ledger | double-entry has been violated |
| a household sees another household's data | isolation failure |
| a currency mismatch appears anywhere | money outside the totals |
| a backup fails | you no longer have a recovery path |
| an object backup fails | documents are unprotected |
| an erasure returns `ERASURE_STORAGE_UNAVAILABLE` | a deletion could not be proven |
| a `500` on any financial surface | unknown state |
| net worth is wrong, or changes without a cause you can name | the thing the product exists to get right |
| any secret or configuration failure at startup | the deployment is not what you think it is |
| you suspect data has been lost | assume you are right until you prove otherwise |

**What to do**

1. Stop entering data. Tell the household to stop too.
2. Do not restart anything yet; a restart can destroy the evidence.
3. Take a backup if the system is still healthy enough — `pnpm backup:pilot`.
4. Copy the logs: `docker compose logs api worker > incident-$(date +%F-%H%M).log`
5. Write down what you were doing, in what order, and what you saw.
6. Investigate before continuing. If you cannot explain it, do not resume.

### The erasure STOP condition in particular

If an erasure returns `ERASURE_STORAGE_UNAVAILABLE`, the system is telling you
something precise: it could not prove that a document was deleted, so it deleted
nothing and kept everything needed to try again. That is the system working.

**Do not retry blindly, and do not edit anything by hand.** In particular do not
edit `documents.bucket` or any storage key in the database. Those values are the
only record of where a document lives, and changing them can make a later
erasure delete the wrong thing or report success while the document survives.

Instead:

1. Check the object store is up: `docker compose ps minio`
2. Check the bucket exists and is the expected one: `pnpm pilot:preflight`
3. Check credentials have not changed.
4. Once the underlying problem is fixed, retry the erasure through the product.
   The request is still there and still retryable.
5. If the bucket itself is wrong or missing, that is an incident, not a retry.
   Stop and investigate.

---

## Aborting the pilot

When the pilot ends, whether planned or not:

1. `pnpm backup:pilot` — one final backup.
2. Tell the household the pilot has stopped and what happens to their data.
3. If they asked for their data: Settings → Integritet → Exportera min data.
4. If they asked for deletion: Settings → Integritet → Radera hushållet, and
   type the household name to confirm. Verify it reports `completed`.
5. `docker compose stop`
6. Decide what happens to the backups. They contain real financial data and are
   covered by the retention policy in
   [`PILOT_DATA_POLICY.md`](./PILOT_DATA_POLICY.md): if the household has asked
   for erasure, the backups holding their data must be destroyed at the end of
   the retention window, and the erasure ledger keeps a record so that any
   restore in the meantime re-applies the erasure.

---

## Where things are

| | |
|---|---|
| Backups | `var/backups/<backupId>/` |
| Backup manifest | `var/backups/<backupId>/manifest.json` |
| Erasure ledger | `var/erasure-ledger/erasures.jsonl` |
| Logs | `docker compose logs api worker` |
| Scope and limits | [`PILOT_SCOPE.md`](./PILOT_SCOPE.md) |
| Configuration contract | [`PILOT_CONFIGURATION.md`](./PILOT_CONFIGURATION.md) |
| Start checklist | [`PILOT_START_CHECKLIST.md`](./PILOT_START_CHECKLIST.md) |
| Data and retention policy | [`PILOT_DATA_POLICY.md`](./PILOT_DATA_POLICY.md) |

Never delete `var/erasure-ledger/`. It is what stops a restore from undoing an
erasure, and it must outlive every backup that could be restored.
