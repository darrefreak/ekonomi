# Pilot Data, Backups and Erasure

How real financial data is held during the pilot, how long copies of it live,
and what happens when a household asks to be erased.

## The awkward part, stated plainly

A backup taken on Monday contains the household erased on Tuesday. That is not a
bug in the backup; it is what a backup is. It does mean the product cannot
honestly claim that pressing "Radera hushållet" makes every copy of the data
vanish everywhere at that instant, and this document does not claim it.

What the product does claim, and what is verified:

1. The **live system** deletes the data immediately and completely. The database
   rows go, and every stored object is deleted and confirmed gone by the store
   that holds it. A completed erasure means the live data is gone.
2. **Backups** may still contain it, for at most the retention window below.
3. **A restore cannot bring it back.** Every erasure is recorded in a durable
   ledger outside the database, and any restored copy has those erasures
   replayed over it before it may be used.
4. When the retention window passes, the backups holding it are destroyed, and
   the data is then gone everywhere.

So the honest promise is: *gone from the live system now; gone from every copy
within the retention window; and never recoverable through a restore in the
meantime.*

## Retention

| | Pilot policy |
|---|---|
| Backup retention | **14 days** |
| Minimum kept | 3 complete backups, whatever their age |
| Applied by | `pnpm backup:prune` |
| Erasure ledger retention | **indefinite** — it must outlive every restorable backup |

Fourteen days is chosen to be longer than any plausible "we noticed on Monday
that Friday was wrong" window, and short enough that erased data does not linger.
The three-backup minimum exists so a quiet fortnight cannot leave the pilot with
no restore point at all.

Expired backups are removed by running `pnpm backup:prune`, which is a
deliberate operator action rather than a background job — deleting things that
contain real financial documents should be something a person does on purpose.

## The erasure ledger

`var/erasure-ledger/erasures.jsonl`, append-only, one JSON object per erasure:

```json
{"householdId":"…","requestId":"…","erasedAt":"2026-08-09T…","objects":[{"bucket":"ffos-pilot","storageKey":"households/…"}]}
```

**What it contains:** identifiers only. A household id, a request id, a
timestamp, and the bucket and key of each object. No name, no amount, no
description, no document content. Reading the whole file tells you that erasures
happened and how many objects each removed, and nothing about the people.

**Why it lives outside the database:** so that restoring the database cannot roll
it back. A tombstone stored inside the data it describes would vanish along with
everything else the moment an older snapshot was restored, which is precisely
when it is needed.

**When it is written:** after every object is confirmed deleted and before the
database rows are removed. At that moment the erasure is already irreversible in
storage, so the record is true; and if the write fails, the rows are still there
and the whole erasure can be retried. The erasure will not complete if the
ledger cannot be written.

**When it is replayed:** by `pnpm recovery:prepare`, over every restored copy,
before that copy is considered valid. The recovery then verifies that no erased
household is present, and refuses the recovery if one is.

Never delete this file. If it is lost, every backup older than the loss becomes
unsafe to restore, because there is no longer any record of what has been erased
since.

## Restoring a backup that predates an erasure

This is the case the ledger exists for, and it is drilled:

```
household created, document uploaded, marker inside it
backup taken
household erased through the product
  → live object confirmed gone
  → erasure recorded in the ledger
pre-erasure backup restored into the recovery environment
  → erasure replayed
  → the household is not in the recovery copy
  → its document row is not there
  → its object is not in the recovery bucket
  → none of its financial rows survived
```

Run it with `node scripts/ops/drill.mjs privacy`. It passes 11 of 11.

## Backup copies are not document storage

The backup directory holds copies of objects on the host filesystem. It is not a
second bucket, the application never reads from it, and nothing in the product
resolves a document to it. It exists solely to be restored from, and the only
supported way to read it is a recovery into the isolated recovery environment.

## Bucket versioning is not the backup strategy

An earlier version of `DATA_RETENTION.md` suggested using MinIO bucket
versioning for object backup. It must not be used, and the preflight now refuses
to start a pilot on a versioned bucket.

The reason is measured rather than theoretical. With versioning enabled, the
application deletes an object, the store confirms the current version is gone,
the erasure correctly reports `completed` — and the previous version remains
fully readable, marker and all. Versioning would turn every completed erasure
into a false statement.

Backups are therefore a separate copy, on a separate medium, with their own
bounded retention, and the ledger is what keeps them from contradicting an
erasure.

## Recovery objectives

| | Pilot target |
|---|---|
| RPO — how much data a failure may cost | **24 hours**, and in practice one session, because a backup is taken before every session |
| RTO — how long recovery may take | **several hours**, manual, one operator following the runbook |

These are deliberately modest. There is no high availability, no automatic
failover and no replication. One person restores from a file by hand, and the
drill takes minutes on pilot-sized data — the hours are for deciding what to do,
not for the machine.

## What is logged

Never: signing secrets, passwords, connection strings, storage credentials,
tokens, personnummer, or the contents of an uploaded document. The ops commands
print host, port, database name, bucket name and counts only. The one place a
personnummer legitimately appears is inside a document a participant uploaded,
which lives in object storage and never in a log line.
