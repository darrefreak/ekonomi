# Human GO / NO-GO

The machine-verifiable part of the pilot start checklist has been executed and
the results are in
[`PILOT_GO_NO_GO_PACKAGE.md`](./PILOT_GO_NO_GO_PACKAGE.md).

Everything below is a judgement or an acceptance of risk. None of it can be
decided by running a command, and none of it has been decided for you.

Date: ____________  Operator: ____________

---

## Understanding what this is

- [ ] I understand this is a limited pilot, not a launch.
- [ ] Only one household will contain real data.
- [ ] That household uses SEK. The product supports no other currency, and a
      household created in another cannot hold an account at all.
- [ ] I have read [`PILOT_SCOPE.md`](./PILOT_SCOPE.md) and accept its limits.
- [ ] I have read [`PILOT_SUCCESS_CRITERIA.md`](./PILOT_SUCCESS_CRITERIA.md) and
      know what the pilot has to demonstrate.

## What is switched off

- [ ] No automatic payment or trading functionality is enabled. (Verified: no
      such code exists in the product.)
- [ ] No real bank, BankID, Kivra, OCR or browser integration is enabled, and I
      will not enable one without a separate approval.
- [ ] The AI advisor is analysis and recommendation only; it cannot move money.

## Destruction and recovery

- [ ] I understand erasure is genuinely destructive. When a household is erased,
      its documents are deleted from object storage and confirmed gone, and no
      restore will bring them back.
- [ ] I understand backup retention is 14 days, and that a backup may contain
      data a participant has since asked to have erased.
- [ ] I have verified where backups are stored: `var/pilot-backups/` on this
      host. I have looked at the directory myself.
- [ ] I know where the erasure ledger is stored — `var/pilot-erasure-ledger/` —
      and that deleting it would make older backups unsafe to restore.

### Off-host backup — choose one

The backup destination is local host storage. It survives losing a container; it
does not survive losing the host. Off-host copying is **not automated**.

- [ ] **A.** I have copied the verified pre-pilot backup to encrypted off-host
      storage. Location recorded: ______________________________
- [ ] **B.** I explicitly accept the local-host-only backup risk for this
      extremely limited first pilot, having understood that a host failure would
      lose the household's data entirely.

*Recommended: A.*

## Operating it

- [ ] I know how to invoke the abort procedure and where it is written down:
      [`PILOT_ABORT_RUNBOOK.md`](./PILOT_ABORT_RUNBOOK.md).
- [ ] I have read [`PILOT_ABORT_CRITERIA.md`](./PILOT_ABORT_CRITERIA.md) and know
      what stops the pilot and what does not.
- [ ] I understand that a `503 ERASURE_STORAGE_UNAVAILABLE` means a deletion
      could not be proven, that nothing was removed, and that it requires
      investigation rather than a blind retry.
- [ ] I understand I must never hand-edit `documents.bucket` or a storage key.
- [ ] I will run `pnpm pilot:preflight` and take a backup before every session.
- [ ] I will run `pnpm pilot:check` daily while real data exists.
- [ ] I will stop the pilot if a financial invariant fails, even if everything
      else looks fine.

## The participant

- [ ] The household taking part knows this is a pilot of unreleased software.
- [ ] They know what data they are being asked for, and that it stays on this
      host.
- [ ] They know they can export or erase their data at any time, and how.
- [ ] They know who to contact if a figure looks wrong.

## Deployment reality

- [ ] The pilot will run on the environment the preflight was executed against,
      or the preflight will be re-run on the environment it actually runs on.
      (The verification in the package was performed against a locally
      provisioned pilot environment: database `ffos_pilot`, bucket `ffos-pilot`.)
- [ ] The deployment is not reachable from the public internet. Registration is
      open in the product.

---

## The decision

Everything above is checked, and I accept the limitations recorded in the
decision package.

- [ ] **I approve introducing real pilot data.**

Signed: ____________________  Date: ____________

> This last box must never be checked by a machine, by a script, or by anyone
> who has not gone through the boxes above. The system's recommendation is only
> that the technical preconditions are met.
