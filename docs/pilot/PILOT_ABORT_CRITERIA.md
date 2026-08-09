# Pilot Abort Criteria

What stops the pilot, and what does not.

The distinction matters in both directions. Treating every rough edge as an
emergency means the pilot never finishes and nothing is learned. Treating a
financial error as a rough edge means the household's money is wrong and nobody
notices. So the line is drawn once, here, before anyone is invested in the
answer.

---

## STOP immediately

If any of these occurs, **stop entering data at once** and follow
[`PILOT_ABORT_RUNBOOK.md`](./PILOT_ABORT_RUNBOOK.md). Do not attempt a fix while
the system is still being used.

### Financial integrity

| Condition | Why it stops the pilot |
|---|---|
| Net worth is wrong and cannot be explained | the one number the product exists to get right |
| The accounting oracle fails | a figure is no longer derivable from the ledger; this has caught real errors twice |
| A ledger entry does not balance | double-entry has been violated; nothing downstream can be trusted |
| A financial effect appears twice | one intent, two economic effects — money that was never spent |
| Any financial calculation discrepancy nobody can account for | "it is probably rounding" is not an explanation |
| Financial data is lost | |
| Financial data is corrupted | |
| Database integrity failure | orphans, broken references, constraint violations |

### Isolation and currency

| Condition | Why |
|---|---|
| One household can see another's data | the demo household and the pilot household must never mix |
| An unsupported currency reaches the active ledger | V1 has no FX engine; money outside the totals is money that silently disappears |

### Privacy and recovery

| Condition | Why |
|---|---|
| An erasure reports `COMPLETED` without confirmed absence | the exact defect two audits were spent closing |
| A backup fails | the recovery path is gone; everything after this point is unprotected |
| A verified backup cannot be produced | same |
| The restore or recovery mechanism becomes unavailable | a backup you cannot restore is not a backup |
| A production or default secret failure | the deployment is not what it is believed to be |

---

## Do not stop the pilot

These are recorded as findings and carried on with. Note them, screenshot them,
keep going.

- a minor UI issue: alignment, spacing, a truncated label
- anything cosmetic
- a non-critical mobile layout issue
- a recommendation that is unhelpful or obvious, as long as its figures are right
- a forecast that turns out to be inaccurate, as long as it is explainable
- a slow page, within reason
- a Swedish phrasing that reads awkwardly
- a missing convenience: a filter, a sort, an export column
- an intermittent test failure in CI that does not reproduce against the pilot

The test for the grey area: **does it change a number, expose data, or remove a
recovery path?** If none of the three, it is a finding, not an abort.

---

## The judgement call

Some things are not on either list. When in doubt:

1. Can the household's money be wrong right now? → **stop**.
2. Could data be lost or exposed right now? → **stop**.
3. Neither, and it can wait until tomorrow? → record it and continue.

Nobody has ever regretted stopping a pilot for a day. Deciding to continue
because stopping felt dramatic is how a small problem becomes an incident.

---

## After an abort

The pilot does not resume on a hunch. Resuming requires:

- the cause understood and written down
- a fix, or a documented reason the pilot can safely continue without one
- a verified backup taken since the fix
- `pnpm pilot:preflight` passing
- the financial oracle passing
- an explicit human decision to resume, recorded with a date

An abort is not a failure of the pilot. It is the pilot doing its job.
