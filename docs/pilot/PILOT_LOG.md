# Pilot Log

The running record of the pilot. One entry per session, per incident, and per
decision. Written at the time, not reconstructed afterwards.

Keep entries short and factual. What was done, what was expected, what happened.

---

## 2026-08-09 — Pilot started

**Decision:** GO, given by the operator.
**Commit:** `e7d8180` plus the pilot deployment on this branch.
**Environment:** `pilot`

| | |
|---|---|
| Database | `ffos_pilot` on `postgres:5432` — empty at start |
| Bucket | `ffos-pilot` — empty at start, versioning off, object lock off |
| API | `http://192.168.0.30:3010` |
| Web | `http://192.168.0.30:3020` |
| Erasure ledger | `var/pilot-erasure-ledger/` — empty at start |
| Backups | `var/pilot-backups/` |

**Preflight:** 25 mandatory checks, 0 failed, 0 advisories.

**Pilot-start backup:** `20260809T213456Z-voohud`, status `COMPLETE`, taken of
the empty database before any data existed. Verified: checksum matches, dump
readable by `pg_restore`.

**State at start:** 0 households, 0 users, 0 accounts, 0 postings, 0 documents,
0 recorded erasures. Nothing in the pilot environment has ever held real data.

**Notes.**

The pilot API refused to start on the first attempt, because Docker Compose
interpolated a placeholder secret from the calling shell rather than from
`.env.pilot`. That is the production secret guard working exactly as intended,
at the moment it mattered most. `scripts/ops/pilot-stack.sh` now runs Compose
with a sanitised environment so the trap cannot recur, and `pnpm pilot:up` is
the supported way to start the stack.

Demo reseeding is refused in this deployment (`NODE_ENV=production` and
`FFOS_ALLOW_DEMO_RESEED` unset), so "Ladda demodata" in onboarding cannot
pollute the pilot database.

**Open item at start:** off-host backup is not automated. The operator has not
yet recorded choice A (copy the pre-pilot backup off-host) or choice B (accept
the local-host-only risk) in `HUMAN_GO_NO_GO.md`. Until A is done, a failure of
this host loses the pilot data.

---

## Entry template

```
## YYYY-MM-DD — <what this entry is>

Preflight: pass / fail
Backup: <backupId> or none
What was done:
What was expected:
What happened:
Follow-up:
```
