# Pilot Decision Package

**Prepared** 2026-08-09
**Commit** `7dd07f2` plus the health-identity change on this branch
**Machine recommendation** **TECHNICALLY READY FOR HUMAN GO/NO-GO**

> **Decision taken.** The operator gave GO on 2026-08-09. The pilot deployment
> is running and the start is recorded in [`PILOT_LOG.md`](./PILOT_LOG.md).
> Day-to-day operation: [`PILOT_OPERATING.md`](./PILOT_OPERATING.md).
>
> **No real data has been entered by this system.** Entering the household's
> data is a person's job.
>
> One item from [`HUMAN_GO_NO_GO.md`](./HUMAN_GO_NO_GO.md) remains open: the
> off-host backup choice, A or B.

---

## Technical readiness

| | Result | Evidence |
|---|---|---|
| Financial core | **PASS** | `accounting-integrity.py` 12 / 12 |
| Financial oracle | **PASS** | derived independently of product aggregation; net worth delta 0 |
| Currency invariant | **PASS** | `currency-invariant.py` 23 / 23, `invariant-reacceptance.py` 27 / 27 |
| Idempotency and atomicity | **PASS** | 18 / 18 |
| Household isolation | **PASS** | `security-probe.py` SEC-001…SEC-010, 37 surfaces, no leaks |
| Erasure | **PASS** | `erasure-invariant.py` 14 / 14; fail-closed on outage, wrong bucket, denied credentials |
| Production secret guard | **PASS** | `production-secret.py` 14 / 14; the pilot API boots under `NODE_ENV=production` |
| Backup — Postgres | **PASS** | `pg_dump -Fc`, checksummed, verified readable by `pg_restore` |
| Backup — objects | **PASS** | per-object checksums, separate destination |
| Backup verification | **PASS** | artefacts exist, non-empty, readable, correct environment, checksums match |
| Isolated restore | **PASS** | into `ffos_pilot_recovery` / `ffos-pilot-recovery`; live targets refused |
| Privacy replay after restore | **PASS** | privacy drill 11 / 11 in the pilot environment |
| Pilot preflight | **PASS** | 25 mandatory checks, 0 failed, 0 advisories |
| Pilot DB reset protection | **PASS** | `db:reset` refuses `ffos_pilot`; the test runner refuses it too |
| Desktop E2E | **PASS** | 59 passed, 10 skipped |
| Mobile E2E | **PASS** | included in the same run |
| Docker | **PASS** | stack healthy, rebuilt from this commit |

### The drills, run in the pilot environment

| Drill | Result |
|---|---|
| Recovery — backup, lose live state, restore, compare | **14 / 14**, net worth exact to the öre, documents byte-identical |
| Privacy — backup, erase, restore, must stay erased | **11 / 11** |
| Negative — the failures that must be refused | **19 / 19** |

### What was provisioned to verify this

A pilot-shaped environment was created so the checklist could be executed
against a pilot rather than against development: database `ffos_pilot` (empty,
migrated), bucket `ffos-pilot` (versioning off, object lock off), generated
secrets in a git-ignored `.env.pilot`, and an API process running with
`NODE_ENV=production` and `APP_ENV=pilot`.

It was then reset to pristine — database dropped and re-migrated, bucket
emptied, ledger cleared, drill backups removed — and the final pre-pilot backup
taken of the clean state.

**Pre-pilot backup:** `20260809T192246Z-neke79`, status `COMPLETE`, environment
`pilot`, 0 households, database dump checksummed and verified restorable.

### One change was made

`GET /health` now reports which environment, database and bucket the process is
actually serving, and the preflight compares that against what it just checked.
Without it, preflight could pass against the pilot database while the running
application wrote to development — a green result about the wrong system, which
is the class of mistake all of this exists to prevent. Host, database and bucket
names only; no credentials.

---

## Pilot scope, in one paragraph

One household, one owner to start, SEK only, data entered by hand, up to 10
accounts, 5 000 transactions, 100 documents, 5 vehicles and 5 users. No bank
integration, no BankID, no Kivra, no OCR, no browser automation, no payments, no
trading, no investment execution — none of which exist in the codebase to be
switched on. The AI advisor reads the household's own figures and cannot move
money. Erasure is two-step and owner-confirmed. Full detail:
[`PILOT_SCOPE.md`](./PILOT_SCOPE.md).

---

## Known limitations

Accepted deliberately for a first pilot, and each one is a real constraint
rather than a caveat:

| Limitation | What it means in practice |
|---|---|
| **Recovery is manual** | no failover, no replication. One operator restores from a file following the runbook. RPO 24 hours, in practice one session; RTO several hours. |
| **Backups are local-host only** | they survive losing a container, not losing the host. Off-host copying is not automated and is a human checklist item. |
| **14-day backup retention** | a backup may hold data a participant has since erased, for up to 14 days. The erasure ledger stops a restore resurrecting it; retention is what finally removes it. |
| **SEK only** | a household in any other currency cannot hold an account. |
| **No real integrations** | every figure is entered by hand. That is the point of this pilot, and it is also work for the household. |
| **No native iOS** | the mobile web interface is tested and works; there is no app. |
| **Registration is open** | the deployment must stay off the public internet. |
| **A `503` on erasure needs a person** | fail-closed is correct behaviour, not an error to retry past. |
| **One intermittent E2E test** | `route-contract` mobile navigation occasionally fails with a WebKit engine crash under parallel load; the route serves correctly and it passes in isolation. Harness flakiness, tracked as FPR-007. |
| **Known non-blocking findings** | oversized amounts return 500 rather than a validation error (FPA-005); the password policy is length-only (FPA-006); one dangling audit row can survive concurrent erasure confirmations (FPR-004). None affects financial correctness or data safety. |

---

## Off-host backup

**OFF-HOST BACKUP: NOT YET AUTOMATED.**

The human checklist requires one of two answers before GO:

- **A** — copy the verified pre-pilot backup to encrypted off-host storage, and
  record where. *Recommended.*
- **B** — explicitly accept the local-host-only risk for this first pilot.

Not implementing a cloud backup platform was deliberate: it is a larger piece of
work than the pilot warrants, and pretending otherwise would delay a decision
that a single `cp` to an encrypted drive can unblock.

---

## Human decisions required

Everything that cannot be truthfully decided by a machine is in
[`HUMAN_GO_NO_GO.md`](./HUMAN_GO_NO_GO.md): understanding the scope, accepting
the retention and recovery limitations, choosing A or B on off-host backup,
confirming the participant knows what they are joining, and the final approval
to introduce real data.

That final box must never be checked automatically.

---

## If the pilot runs somewhere else

The verification above was performed against a locally provisioned pilot
environment. If the real pilot runs on a different host, database or bucket,
`pnpm pilot:preflight` must be run there and must pass before starting. It
checks the running application's own reported identity, so it cannot be
satisfied by pointing it at the wrong system.
