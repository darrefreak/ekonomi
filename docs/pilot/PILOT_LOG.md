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

**Pilot-start backup:** `20260809T213734Z-o5ul2u`, status `COMPLETE`, taken of
the empty database before any data existed. Verified: checksum matches, dump
readable by `pg_restore`.

**State at start:** 0 households, 0 users, 0 accounts, 0 postings, 0 documents,
0 recorded erasures. Nothing in the pilot environment has ever held real data.

**Deployment smoke test.** Before handover, the deployment was exercised with
synthetic data through the pilot web origin: registration, household creation
(SEK), an account, an income booking, and every main surface. Net worth came out
at exactly 150 000 öre from a 100 000 opening balance plus 50 000 income. CORS
allows the pilot web origin and not a foreign one, and `POST /demo/load` is
refused with 403. The pilot database and bucket were then dropped, re-migrated
and emptied, and this backup was taken of the pristine result — so the smoke
test left nothing behind.

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

## 2026-08-09 21:46 — First household created; demo button removed from the pilot

**What happened.** The operator registered and created the household
`Mitt hushåll` (SEK) through the pilot at http://192.168.0.30:3020, then pressed
"Ladda demodata" on the last onboarding step and got **"Invalid credentials"**.

**Cause.** Onboarding called `POST /demo/load`, which this deployment refuses
with 403 because it holds real data, swallowed that refusal, and went on to sign
in as `demo@ffos.local` — a user that does not exist in the pilot database. The
401 from that login was shown raw. The message was misleading: nothing was wrong
with any credentials, the deployment simply has no demo.

**Fix.** Onboarding now asks `GET /demo/info` after the household is created and
only offers the demo option where demo data exists. Where it does not, the
button is replaced by "Demodata är avstängt i den här installationen." The
refusal is no longer swallowed either: if a load fails, the reason is shown
instead of falling through to a login that cannot work.

Rebuilt on the pilot and on development; E2E 59 passed on both projects.

**Not a financial issue.** No figure, no balance and no stored data was
affected. Recorded here rather than treated as an abort, per
`PILOT_ABORT_CRITERIA.md`.

**State now.** 1 user, 1 household (`Mitt hushåll`, SEK), 0 accounts, 0 postings,
0 documents. Backup taken with the first real data present:
`20260809T215221Z-85jtkc`, status `COMPLETE`, verified. Daily check: 29
mandatory checks, 0 failed, 0 advisories.

**Next.** Add the household's accounts with their real opening balances, then
reconcile before entering a month of activity. Do not run onboarding again —
it would create a second household.

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

## 2026-08-10 — SEB CSV-import driftsatt till piloten

Operatören begärde senaste koden på 3020. Utfört i den ordningen:

1. **Backup före allt annat:** `20260810T125255Z-vsnf7u` — databasens checksumma verifierad,
   dumpen läsbar av `pg_restore`, 0 objekt att kopiera.
2. **Migrering av `ffos_pilot`.** Pilot-API:t kör inte migreringar vid start, så
   den kördes separat. Migration 0028 lade till 7 kolumner på `import_batches`,
   3 på `source_transactions` och `row_number` på `raw_import_records`, alla
   verifierade efteråt.
3. **Ombyggnad av stacken** via `scripts/ops/pilot-stack.sh up`.

Verifierat efteråt:

- Importrutterna svarar `401` (finns, kräver inloggning) istället för `404`.
- `GET /imports` svarar `200` och webbdelen innehåller sidan.
- Inloggningssidan erbjuder fortfarande inget demokonto — UX-arbetet följde med
  i samma image.
- Data intakt: 1 hushåll, 1 användare, 0 transaktioner.
- `pilot:preflight` 25/25, `pilot:check` 29/29, båda utan anmärkningar.

Imagen innehåller allt arbete från 2026-08-10: UX-passet och SEB-importen. Ingen
riktig data har importerats — piloten har fortfarande 0 transaktioner.
