# OR1 — Pilot Operational Readiness

**Date:** 2026-08-09
**Branch:** `cursor/or1-pilot-operational-readiness-9c58`
**Scope:** FGN-004 from the Final Pilot GO/NO-GO — no operational recovery path
for real data.
**Explicitly out of scope:** every product feature. No financial feature was
added, no ledger or accounting semantics changed, no bank integration, no OCR,
no native iOS, no redesign.

This report records what was built and how it was proved. It does **not** start
the pilot and does not declare the pilot approved.

---

## Acceptance table

| Item | Result |
|---|---|
| Pilot scope | **PASS** — `docs/pilot/PILOT_SCOPE.md` |
| Pilot configuration contract | **PASS** — `docs/pilot/PILOT_CONFIGURATION.md` |
| Postgres backup | **PASS** — `pnpm backup:postgres` |
| Postgres restore | **PASS** — `pnpm restore:postgres`, into a recovery database |
| Object backup | **PASS** — `pnpm backup:objects` |
| Object restore | **PASS** — `pnpm restore:objects`, into a recovery bucket |
| Unified backup manifest | **PASS** — one manifest ties the pair together |
| Checksum verification | **PASS** — SHA-256 per artefact and per object |
| Recovery environment | **PASS** — separate database and bucket, never the live ones |
| Recovery validation | **PASS** — ledger, currency, orphans, object resolution |
| Erasure-after-restore safety | **PASS** — durable ledger, replayed on every recovery |
| Bucket versioning OFF precondition | **PASS** — enforced, not documented |
| Object lock OFF | **PASS** — enforced |
| Retention OFF | **PASS** — enforced where queryable |
| Pilot preflight | **PASS** — `pnpm pilot:preflight`, fail-closed |
| Pilot daily check | **PASS** — `pnpm pilot:check` |
| Rollback/abort runbook | **PASS** — `docs/pilot/PILOT_RUNBOOK.md` |
| Start checklist | **PASS** — `docs/pilot/PILOT_START_CHECKLIST.md` |
| STOP conditions | **PASS** — runbook, including the erasure-specific one |
| Backup/restore drill | **PASS** — 14 / 14 |
| Privacy restore drill | **PASS** — 11 / 11 |
| Negative drill | **PASS** — 19 / 19 |
| Financial oracle | **PASS** — 12 / 12 |
| Currency invariant | **PASS** — 23 / 23 and 27 / 27 |
| Erasure invariant | **PASS** — 14 / 14, 21 / 21 |
| Database reset safety | **PASS** — a pilot database can never be reset |
| Build / lint / typecheck | **PASS** |
| Tests | **PASS** — 231, 136 database-backed |
| E2E | **PASS** — 59 desktop and mobile |
| Docker | **PASS** |
| **Remaining BLOCKER** | **0** |
| **Remaining HIGH** | **0** |

---

## What existed before, and what was missing

The go/no-go gate found the product technically sound and operationally
unready. The erasure fix had made deletion real, which raised the cost of a
mistake at exactly the moment recovery readiness was still zero: no backup
tooling, no object-storage backup path of any kind, no abort procedure, no
written scope. `RT-015` had been reproducing on the untouched probe for weeks —
"backup/restore tooling found: none — documentation only".

Nine commands and five documents now close that.

| Command | What it does |
|---|---|
| `pnpm pilot:preflight` | read-only; refuses to let a pilot start on a wrong database, wrong bucket, versioned bucket, placeholder secret, missing backup destination or pending migration |
| `pnpm pilot:check` | daily, read-only; adds ledger integrity, currency invariant, backup freshness |
| `pnpm backup:postgres` | `pg_dump -Fc`, checksummed, verified readable by `pg_restore` |
| `pnpm backup:objects` | `aws s3 sync` to a host directory, with a per-object checksum listing |
| `pnpm backup:pilot` | both, plus the erasure ledger snapshot and one manifest |
| `pnpm backup:prune` | applies the retention window deliberately, never in the background |
| `pnpm restore:postgres` | into a recovery database |
| `pnpm restore:objects` | into a recovery bucket |
| `pnpm recovery:prepare` | both, plus erasure replay, plus validation |

Established tooling throughout: `pg_dump`/`pg_restore` inside the Postgres
container (the host has no client binaries), and the AWS CLI against MinIO. No
serialisation or object-copy logic was reinvented.

---

## Decisions worth stating

### Environment identity is separate from NODE_ENV

`APP_ENV` is one of `development`, `test`, `pilot`, `production`. They answer
different questions — `NODE_ENV` tells the framework how to behave, `APP_ENV`
tells the operator and the tooling which system this is. A pilot runs with
production semantics while not being production, and collapsing the two is how a
pilot ends up writing to a development database.

The pilot database name must contain `pilot`, which is not a convention: the
reset guard already treats `pilot` as a protected marker, so such a database can
never satisfy `pnpm db:reset` whatever the environment says. Verified:

```
ffos_pilot           REFUSED — the name matches a protected pattern
ffos_pilot_recovery  REFUSED — the name matches a protected pattern
ffos_dev             ALLOWED (development)
ffos_test            ALLOWED (test)
```

### The erasure ledger, and why it is not in the database

A backup taken on Monday contains the household erased on Tuesday. Restore it
naively and the erasure becomes a lie. Something has to remember, and it cannot
live in the database, because restoring the database would roll that memory back
along with everything else.

So every completed erasure appends one line to
`var/erasure-ledger/erasures.jsonl`, outside the database and outside the backup
directory, and `pnpm recovery:prepare` replays those erasures over any restored
copy before the copy may be used. The recovery then *verifies* that no erased
household is present and refuses if one is.

The tombstone holds identifiers only — household id, request id, timestamp,
bucket and key. No name, no amount, no description, no document content. A test
asserts that no field beyond those four may appear.

The write happens after every object is confirmed gone and before the rows are
deleted. That is the only ordering that is safe in both directions: the objects
are already irreversibly gone so the record is true, and if the append fails the
rows are still there and the whole erasure is retried. An erasure will not
complete if the ledger cannot be written — proved by a test that makes the
directory read-only.

### Versioning is not the backup strategy

`DATA_RETENTION.md` §6 previously recommended "MinIO (bucket versioning/export
senare)". That recommendation is withdrawn and the document now says why, at
length, because the reason is measured rather than theoretical: with versioning
enabled the application deletes an object, the store confirms the current
version is gone, the erasure correctly reports `completed` — and the previous
version remains fully readable, personnummer and all.

It is now enforced rather than advised. The preflight refuses a versioned
bucket, and so does the object backup itself:

```
NG-17 preflight blocks a bucket with versioning enabled
NG-18 a backup refuses to run against a versioned bucket
NG-19 preflight blocks a bucket with object lock enabled
```

### Restore fidelity is not the same as live data health

The drills caught a flaw in my own first design. Recovery validation asserted
that every restored document resolves to a restored object — which sounds right,
and is wrong: if the live system already had a dangling locator when the backup
was taken, a faithful restore reproduces it, and refusing the recovery would
make a pilot with one broken locator impossible to restore *at all*, precisely
when restoring matters.

The two questions are now asked separately. Recovery fails if an object the
backup held did not come back; a row that already had no object when the backup
was taken is reported as what it is — live data health — and surfaced daily by
`pnpm pilot:check`, where an operator can act on it.

---

## Drill evidence

### Backup and restore — 14 / 14 (`node scripts/ops/drill.mjs recovery`)

Builds a pilot-like household through the product's own API (accounts, income,
expenses, a vehicle, an uploaded document), records the expected state, takes a
real backup, then loses live state on purpose — a transaction added after the
backup, and a document destroyed row-and-object together.

```
DR-05 net worth matches to the öre, not approximately    expected 23917450, restored 23917450
DR-06 accounts / events / postings / vehicles / documents restored exactly
DR-07 the transaction made after the backup is absent from the recovery copy
DR-08 the restored document is byte-identical to the original   sha256 06adbb51… vs 06adbb51…
DR-09 the restored document still contains what was uploaded
DR-10 the drill leaves the live system consistent
```

The loss is simulated as loss, not as erasure: the two are different events and
must not be confused, because an erasure is meant to survive a restore whereas
loss is exactly what a restore is for.

### Privacy — 11 / 11 (`node scripts/ops/drill.mjs privacy`)

```
PR-03 the backup really contains the object that is about to be erased
PR-04 the erasure completed                       objectsRemoved 1
PR-05 the live object is gone
PR-06 the erasure is recorded in the durable ledger outside the database
PR-07 recovery prepared from the pre-erasure backup
PR-08 the erased household is not in the recovery copy
PR-09 no document row for the erased household survived the replay
PR-10 the erased object is not in the recovery bucket either
PR-11 no financial row for the erased household survived
```

### Negative — 19 / 19 (`node scripts/ops/drill.mjs negative`)

Preflight blocks: a pilot pointed at a development database, an unreachable
database, a missing bucket, an unexpected bucket, a placeholder secret, a
missing backup destination, destructive resets left enabled, no erasure ledger,
a versioned bucket, an object-lock bucket.

Backups and restores refuse: a failed database dump, a failed object copy, a
partial backup marked COMPLETE, `latest` selecting a failed backup, a corrupted
dump (checksum mismatch, refused before any restore is attempted), object
artefacts from a different backup, a restore targeting the live database, a
restore targeting the live bucket.

---

## Regression

| Gate | Result |
|---|---|
| `pnpm test` | 231 tests, 0 failures, 136 database-backed (was 226 / 136) |
| `pnpm test:e2e:docker` | 59 passed, 10 skipped |
| `pnpm build` / `lint` / `typecheck` | clean |
| `accounting-integrity.py` | 12 / 12 |
| `currency-invariant.py` | 23 / 23 |
| `invariant-reacceptance.py` | 27 / 27 |
| `erasure-invariant.py` | 14 / 14 |
| `erasure.py` | 21 / 21 |
| `budget-bootstrap.py` | 17 / 17 |
| `currency-legacy.py` | 11 / 11 |
| `production-secret.py` | 14 / 14 |
| `security-probe.py` | 16 / 18 — SEC-011 and SEC-014, both known and out of scope |
| `reset-guard.test.ts` | 11 / 11 |
| Docker | stack healthy, rebuilt from this commit |

No pilot probe was modified.

---

## Targets

| | Pilot |
|---|---|
| Scope | 1 household, 1 OWNER, SEK only, manual entry, no integrations |
| Data bounds | ≤ 10 accounts, ≤ 5 000 transactions, ≤ 100 documents, ≤ 5 vehicles, ≤ 5 users |
| Backup schedule | before every session, and daily while real data exists |
| Backup retention | 14 days, minimum 3 complete backups |
| Erasure ledger retention | indefinite — must outlive every restorable backup |
| RPO | 24 hours, in practice one session |
| RTO | several hours, manual, one operator with the runbook |

---

## Known limitations, stated rather than hidden

- **Recovery is manual.** There is no automatic failover and no replication.
  Promotion of a recovery copy is a documented human procedure, deliberately.
- **The backup destination is a local host directory.** Durable against
  container loss, not against loss of the host. Off-host copying is an operator
  responsibility and is not automated here.
- **Backups contain data that may later be erased.** For up to 14 days. The
  ledger prevents a restore from resurrecting it; the retention window is what
  finally removes it. This is stated plainly in the data policy rather than
  papered over.
- **The post-delete read-back cannot detect a lying backend.** It is defence in
  depth with no negative test, because a correct object store cannot be made to
  accept a delete without performing one. Bucket versioning is the real-world
  case where it would matter, which is why versioning is now refused outright.
- **`pnpm pilot:check` reports dangling locators as an advisory, not a failure.**
  A document row with no object is usually the aftermath of an erasure that
  failed closed. It needs a person, not a halt.

---

## Not done, on purpose

- No product feature was added; no financial or ledger semantics were touched.
- No bank integration, BankID, Kivra, OCR, browser automation, native iOS.
- No cloud scheduler, no monitoring stack; the daily check is the monitoring.
- The pilot was **not started**. No real data has been entered.

The next step is a decision to run the pilot, taken against
`docs/pilot/PILOT_START_CHECKLIST.md`.
