# Pilot Abort Runbook

What the operator does, in order, when the pilot must stop.

Read the whole page before starting. The sequence matters: evidence is
destroyed by restarting things, and the temptation to "just restart it and see"
is strongest in exactly the situation where it costs the most.

**Nothing in this procedure is automatic and nothing here overwrites live data.**
There is no automatic rollback, by design.

Trigger: anything in [`PILOT_ABORT_CRITERIA.md`](./PILOT_ABORT_CRITERIA.md).

---

## 1. Stop the writes

```bash
docker compose stop api worker
```

The household stops entering data. Tell them explicitly — "stop" in a message
they will see, not a note for later. Leave the database and object storage
running; you need them.

Stopping the API is the maintenance mode. There is no separate one.

## 2. Stop background mutation

`docker compose stop worker` above already did this. Confirm nothing is still
processing:

```bash
docker compose ps
```

`api` and `worker` must show as exited. `postgres`, `redis` and `minio` stay up.

## 3. Preserve the evidence

Before anything else changes:

```bash
mkdir -p var/incidents/$(date +%F-%H%M)
cd var/incidents/$(date +%F-%H%M)
docker compose logs api worker > application.log 2>&1
docker compose logs postgres minio > infrastructure.log 2>&1
```

Write a plain-text note next to them: what you were doing, what you expected,
what you saw, and the time. Your memory of this will be worse tomorrow than you
think.

Do not restart anything to "get a clean log". The dirty log is the evidence.

## 4. Run the integrity checks

Read-only, safe to run with the API stopped:

```bash
pnpm pilot:check
python3 scripts/pilot/accounting-integrity.py
```

Record both outputs into the incident directory. If the oracle fails, note
exactly which check and which household — `ACC-005` and `ACC-010` mean very
different things.

## 5. Take an emergency backup, if it is safe

Safe means: the database answers, and you have not yet changed anything.

```bash
pnpm backup:pilot
```

If it reports `BACKUP COMPLETE`, note the backup id in the incident file. If it
fails, note that too — a failing backup is itself a finding and tells you the
state is worse than suspected.

If you suspect the live data is *corrupted*, still take it. A backup of a
corrupted state is evidence, and it is labelled with its own timestamp so it
cannot be confused with a good one.

## 6. Find the last known-good backup

```bash
ls var/pilot-backups
cat var/pilot-backups/<backupId>/manifest.json
```

Known-good means: `status: COMPLETE`, taken **before** the first sign of the
problem. If the problem may have been present for days, go back further. The
retention window is 14 days; if the last good backup is older than that, say so
plainly in the incident note.

## 7. Restore — to the isolated recovery environment only

```bash
pnpm recovery:prepare <backupId>
```

This never touches the live pilot. It validates every checksum before writing
anything, restores into `ffos_pilot_recovery` and `ffos-pilot-recovery`, and
refuses outright if either target is the live database or the live bucket.

If it refuses because of a checksum, **do not force it**. A corrupted artefact
means going further back.

## 8. Replay the erasure ledger

`recovery:prepare` does this as part of step 7, and reports how many erasures
were replayed. Confirm you saw that line. If any household was erased since the
backup, the recovery copy must not contain it — the command checks this and
fails if it does.

Never restore a backup into anything a participant can reach without this step
having run.

## 9. Verify the accounting oracle against the recovery copy

`recovery:prepare` validates the ledger, the currency invariant, orphans and
object resolution automatically, and refuses to report success if any fails.
Read its output rather than assuming.

For a deeper check against the recovery database, point the oracle at it and run
it again. Record the result.

## 10. Verify documents and objects

`recovery:prepare` confirms that every object the backup held came back, and
that every document row resolves to a restored object. If it reported rows that
already had no object when the backup was taken, investigate those separately —
they are usually the aftermath of an erasure that failed closed, and they were
already like that before the incident.

## 11. Decide: repair the live state, or replace it

This is a human decision, and it is the point of everything above.

**Repair the live state** when the problem is understood, limited, and fixable
in place — a handful of wrong entries, a known bug with a known blast radius.
The live data is authoritative and nothing is lost.

**Replace from the verified recovery** when the live state cannot be trusted, or
the damage is not bounded. You lose everything entered since the backup, which
is why the backup cadence is per session. Promotion is described under
"Promoting a recovery" in [`PILOT_RUNBOOK.md`](./PILOT_RUNBOOK.md) — stop the
app, back up the broken state anyway, rename the databases, repoint the bucket,
preflight, start, check.

Write down which you chose and why.

## 12. Do not resume without an explicit human GO

Resuming requires all of:

- [ ] the cause is understood and written down
- [ ] a fix is in place, or there is a documented reason it is safe to continue without one
- [ ] a verified backup has been taken since the fix
- [ ] `pnpm pilot:preflight` passes
- [ ] `python3 scripts/pilot/accounting-integrity.py` passes
- [ ] the household has been told what happened and what, if anything, they lost
- [ ] a named person has decided to resume, and the date is recorded

Not "it seems fine now". Not "it has not happened again". Those are how the same
incident happens twice.

---

## Ending the pilot instead of resuming

If the decision is to stop for good, follow "Aborting the pilot" in
[`PILOT_RUNBOOK.md`](./PILOT_RUNBOOK.md): final backup, offer export, honour any
erasure request, stop the stack, and decide what happens to the backups under
the retention policy in [`PILOT_DATA_POLICY.md`](./PILOT_DATA_POLICY.md).

---

## The two things never to do

**Never hand-edit `documents.bucket` or a storage key.** Those values are the
only record of where a document lives. Changing one can make a later erasure
delete the wrong object, or report success while the document survives.

**Never restore over the live database or bucket to "save time".** The commands
refuse it. That refusal is not an obstacle; it is the reason a bad night stays
recoverable.
