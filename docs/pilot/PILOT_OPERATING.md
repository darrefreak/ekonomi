# The pilot is running — what to do now

The system is up and waiting for its first real data. Nothing has been entered:
the pilot database is empty and no household exists.

Entering the household's data is a person's job, not the system's. Nothing in
this repository will invent a balance, a name or a document.

---

## Where it is

| | |
|---|---|
| Product (the household uses this) | **http://192.168.0.30:3020** |
| API | http://192.168.0.30:3010 |
| Reachable from | the private network only. Do not expose it to the internet — registration is open. |

The development stack is still on ports 3000 and 3001, against `ffos_dev`. It is
a different database and a different bucket. Do not confuse them: the pilot is
**3020**.

---

## First session

1. **Preflight, before anything else.**
   ```bash
   pnpm pilot:preflight
   ```
   It must print `Preflight passed`. If it does not, stop and read what it named.

2. **The household creates their account** at http://192.168.0.30:3020, then
   creates one household in onboarding. The currency step states SEK; there is
   nothing to choose.

   Do **not** press "Ladda demodata". It is refused in this deployment anyway,
   but the button is there.

3. **Enter accounts before transactions.** Each account needs its real opening
   balance on a date the household can point to — a bank statement, ideally the
   first of a month. Everything downstream is measured from these.

4. **Enter a month of activity.** Income, expenses, transfers between their own
   accounts, credit card purchases and payments, the mortgage payment split into
   principal and interest exactly as the statement shows it.

5. **Reconcile before going further.** Compare the dashboard's net worth and each
   account balance against the household's own records. If a figure is wrong,
   that is the pilot doing its job — record it in
   [`PILOT_LOG.md`](./PILOT_LOG.md) before entering more.

6. **Back up at the end of the session.**
   ```bash
   pnpm backup:pilot
   ```

---

## Every day there is real data

```bash
pnpm pilot:check      # read-only; health, ledger integrity, backup freshness
pnpm backup:pilot     # daily, even on a day nobody used it
```

`pilot:check` must end with `Pilot check passed`. An advisory is worth reading;
a failure means stop.

---

## Every session

```bash
pnpm pilot:preflight  # before
pnpm backup:pilot     # before, and again after
```

---

## Running the stack

```bash
pnpm pilot:up      # start (safe to re-run; rebuilds if needed)
pnpm pilot:ps      # what is running
pnpm pilot:logs    # follow the logs
pnpm pilot:stop    # stop writes, keep the containers
pnpm pilot:down    # stop and remove the containers
```

The database, Redis and object storage are the shared services in the
development stack's compose project and are not stopped by these commands. The
pilot's data lives in the `ffos_pilot` database and the `ffos-pilot` bucket
inside them.

---

## When something looks wrong

Read [`PILOT_ABORT_CRITERIA.md`](./PILOT_ABORT_CRITERIA.md) first — it says what
stops the pilot and, just as importantly, what does not. A misaligned button is
a note in the log. A wrong balance is a stop.

If you must stop: [`PILOT_ABORT_RUNBOOK.md`](./PILOT_ABORT_RUNBOOK.md), from the
top, in order. Do not restart anything before step 3 — restarting destroys the
evidence you will need.

Two things never to do:

- never hand-edit `documents.bucket` or a storage key;
- never restore over the live database or bucket.

---

## The one open item

**Off-host backup is not automated.** Backups live in `var/pilot-backups/` on
this host. They survive losing a container; they do not survive losing the host.

Before real data goes in, do one of these and record it in
[`HUMAN_GO_NO_GO.md`](./HUMAN_GO_NO_GO.md):

- **A** — copy the pilot-start backup to encrypted off-host storage:
  ```bash
  cp -r var/pilot-backups/20260809T213456Z-voohud /path/to/encrypted/drive/
  ```
  and repeat after each session's backup. *Recommended.*
- **B** — write down that you accept the local-host-only risk for this pilot.

---

## What success looks like

[`PILOT_SUCCESS_CRITERIA.md`](./PILOT_SUCCESS_CRITERIA.md). The short version:
the household's net worth and every account balance reconcile against their own
records, transfers are not spending, the mortgage split is right, the oracle
stays green every week, nothing is ever lost, and the product tells them
something they did not already know.
