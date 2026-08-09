# Pilot Start Checklist

Sign this off before a single real figure is entered. Every line is either
demonstrable or a decision someone has made on purpose.

Date: ____________  Operator: ____________  Commit: ____________

## Scope and approval

- [ ] [`PILOT_SCOPE.md`](./PILOT_SCOPE.md) has been read and approved
- [ ] the household taking part knows what the pilot is, and what it is not
- [ ] they know their data can be exported and erased at any time
- [ ] one household only; no real bank, BankID, Kivra or OCR integration
- [ ] the data limits in the scope document are understood

## Deployment

- [ ] the deployed commit is recorded above and matches what was accepted
- [ ] `git status` is clean; nothing local and unreviewed is running
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck` all pass
- [ ] the stack is running: `docker compose ps` shows api, worker, web, postgres, redis, minio

## Configuration

- [ ] `APP_ENV=pilot`
- [ ] the database name contains `pilot`, so the reset guard protects it
- [ ] the database is not the development or test database
- [ ] migrations are current
- [ ] `S3_BUCKET` equals `FFOS_PILOT_BUCKET`
- [ ] bucket versioning **OFF**
- [ ] object lock **OFF**
- [ ] retention **OFF**
- [ ] signing secrets are generated, not placeholders, and not shared with any other environment
- [ ] `FFOS_ALLOW_DB_RESET` is not set
- [ ] the backup destination exists, is writable and is outside every container volume
- [ ] the erasure ledger directory exists and is outside the backup directory

All of the above are checked mechanically:

- [ ] **`pnpm pilot:preflight` exits zero**

## Recovery readiness

- [ ] a fresh `pnpm backup:pilot` has completed today, with `status: COMPLETE`
- [ ] the backup manifest has been looked at: right environment, right commit, sensible counts
- [ ] a restore drill has been run and passed: `node scripts/ops/drill.mjs recovery`
- [ ] the privacy drill has been run and passed: `node scripts/ops/drill.mjs privacy`
- [ ] the operator knows where backups are and how to restore one
- [ ] the retention policy in [`PILOT_DATA_POLICY.md`](./PILOT_DATA_POLICY.md) is agreed

## Safety evidence

- [ ] financial oracle passes: `python3 scripts/pilot/accounting-integrity.py`
- [ ] currency invariant passes: `python3 scripts/pilot/currency-invariant.py`
- [ ] erasure invariant passes: `python3 scripts/pilot/erasure-invariant.py`
- [ ] household isolation passes: `python3 scripts/pilot/security-probe.py` (SEC-001…SEC-010)
- [ ] desktop and mobile E2E pass: `pnpm test:e2e:docker`
- [ ] the full test suite passes: `pnpm test`

## Operations

- [ ] the operator has read [`PILOT_RUNBOOK.md`](./PILOT_RUNBOOK.md) end to end
- [ ] the STOP conditions are understood, especially `ERASURE_STORAGE_UNAVAILABLE`
- [ ] the operator knows not to hand-edit `documents.bucket` or any storage key
- [ ] a daily `pnpm pilot:check` is scheduled or diarised
- [ ] the deployment is not reachable from the public internet
- [ ] someone is reachable if something goes wrong during a session

## Machine-verified

The items above that a command can decide were executed on 2026-08-09 and the
results are recorded in [`PILOT_GO_NO_GO_PACKAGE.md`](./PILOT_GO_NO_GO_PACKAGE.md).

## Human decisions

The items no command can decide — accepting the retention window, the
local-host backup risk, and the introduction of real data — are in
[`HUMAN_GO_NO_GO.md`](./HUMAN_GO_NO_GO.md).

## Sign-off

I have run the checks above and seen them pass. I know how to stop the pilot,
how to restore it, and what to do if a figure looks wrong.

Signed: ____________________  Date: ____________
