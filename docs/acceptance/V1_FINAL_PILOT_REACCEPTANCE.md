# V1 Final Targeted Pilot Re-acceptance

**Date** 2026-08-09
**Question** Are the four final pilot blockers actually fixed, and is the
financial core still correct?
**Scope** FPA-001 … FPA-004 only. No other finding was re-audited.
**Under test** `cursor/final-pilot-blockers-9c58` @ `db7d0d2`, running in the
Docker stack rebuilt from that commit.

## Verdict

> ### FAIL — do not start a real-data pilot yet
>
> **3 BLOCKER, 0 HIGH.** Two of the four blockers are fixed and hold up under
> attacks they had never seen. Two are not fixed: their remedies closed the door
> that was tested and left an adjacent one open.
>
> FPA-002 and FPA-003 are genuinely done. FPA-001 and FPA-004 are not.
>
> One of the new findings is a financial one: for the first time since the
> financial core was declared correct, the independent oracle fails — reachably,
> through the product's own API.

| Blocker | Claimed | Re-acceptance |
|---|---|---|
| FPA-001 unsupported currency can brick a household | PASS | **FAIL** — FPR-001, FPR-002 |
| FPA-002 production accepts the published placeholder secret | PASS | **PASS** — held against 10 evasion attempts |
| FPA-003 budget does not bootstrap for a non-demo household | PASS | **PASS** — held under concurrency and month gaps |
| FPA-004 erasure requests cannot be executed | PASS | **FAIL** — FPR-003 |

| | |
|---|---|
| Independent financial oracle | **FAIL** — ACC-005, reachable through the API (FPR-002) |
| Ledger identity (ACC-010/011/012) | **PASS** — 122 households, delta 0 |
| Original pilot probes | **53 / 66** on arrival, matching the remediation's own numbers; **52 / 66** once FPR-002 has been exercised, because ACC-005 then fails |
| Security probes | **PASS** |
| Household isolation | **PASS** — 37 surfaces, no leaks |
| Build / lint / typecheck | **PASS** |
| Tests | **PASS** — 189, 115 database-backed, and blind to all three blockers |
| E2E desktop + mobile | **PASS** — 57 passed, one flaky test (FPR-007) |
| Docker | **PASS** |
| **Remaining BLOCKER** | **3** |
| **Remaining HIGH** | **0** |

Findings in full: [`V1_FINAL_PILOT_REACCEPTANCE_FINDINGS.md`](./V1_FINAL_PILOT_REACCEPTANCE_FINDINGS.md).

---

## How this re-acceptance was run

The remediation shipped four probes alongside four fixes. Probes written by the
pass that writes the fix test the doors that pass thought to close, so re-running
them proves only that the author was consistent. Two new probes were written
instead, aimed at the same four claims from directions the remediation never
took:

| Probe | Attacks |
|---|---|
| `scripts/pilot/reacceptance-adversarial.py` | the *household's* base currency rather than the account's; whether an excluded account can still receive money; budget concurrency and month gaps rather than sequential retries; a non-owner member, simultaneous confirmations, and an erasure that runs while object storage is unavailable |
| `scripts/pilot/reacceptance-secret.py` | ten secrets the guard has never been shown — a renamed default, an upper-cased placeholder, long-but-predictable strings — plus the two cases that must still be accepted |

The five original probes were confirmed byte-identical to their pre-remediation
state before being re-run:

```
$ git diff --stat 8c781c9 HEAD -- scripts/pilot/accounting-integrity.py \
    scripts/pilot/pilot-journey.py scripts/pilot/security-probe.py \
    scripts/pilot/open-findings.py scripts/pilot/data-robustness.py
(no output)
```

The containers were rebuilt and recreated from the commit under test, so nothing
here was measured against a stale process.

---

## FPA-001 — FAIL

The account form no longer offers EUR. The **onboarding** form still offers EUR
and NOK for the household itself, and the account form is hard-wired to SEK, so a
household created in EUR or NOK cannot open a single account: `422` from the very
guard this remediation added, with `PATCH /settings` returning `400` because base
currency is not editable. The participant is locked out of a household they
created through the normal product path (FPR-001).

Separately, the chosen remedy for legacy foreign-currency rows — exclude from the
totals, warn, offer archiving — excludes them from *aggregation only*. They stay
writable. Booking income onto one returns `201`, writes the posting in the
household's currency onto an account holding another, and the money then exists in
the product's income statement but not on its balance sheet (FPR-002):

```
recognised income 250000 öre, ledger flow 150000 öre, net worth moved 0 öre
ledger truth 4 850 000 öre   product reports 4 200 000 öre
```

The independent oracle catches the invariant break:

```
[FAIL] ACC-005 every posting matches its account's currency:
       postings whose currency differs from the account 6
```

All six are in households the probe created; the pre-existing data is clean, and
the ledger write path is unchanged by the remediation. What changed is that this
state used to return `500` from seven surfaces and now returns confident wrong
numbers.

---

## FPA-002 — PASS

The strongest of the four. Ten secrets the guard had never been shown were all
refused, and none was echoed into the logs:

| Attempt | Result |
|---|---|
| `DEV-ACCESS-SECRET-CHANGE-ME` (upper-cased) | refused |
| `dev-access-secret-change-me-production-2026` | refused |
| `ffos-access-secret-changeme-…` (renamed default) | refused |
| 64 × `a` | refused |
| `abab` × 16 | refused |
| `0123456789` × 4 | refused |
| `production` × 5 | refused |
| placeholder `JWT_REFRESH_SECRET` | refused, named in the message |
| generated random secret | **starts** |
| `openssl rand -base64 48` | **starts** |

The refresh-secret rationale in `production-config.ts` was checked rather than
taken on trust: refresh tokens really are `randomBytes(48)` opaque strings hashed
in the database, so nothing signs with that variable.

---

## FPA-003 — PASS

Tested where the remediation's sequential retries could not reach:

| Attack | Result |
|---|---|
| 8 simultaneous first-budget submissions, distinct idempotency keys | 1 period, 6 lines |
| 8 simultaneous reads across a month boundary | exactly 1 rollover, 2 periods |
| a budget last touched in May, read in August | resolves to 2026-08 on first read |
| a stranger creating a budget in another household | `403` |

No duplicate period appeared under any of it.

---

## FPA-004 — FAIL

Authorization and idempotency are sound: an `ADULT` gets `403`, an `ADMIN` gets
`403` ("Only an owner can erase a household"), and six simultaneous owner
confirmations erase the household exactly once.

The failure is the promise the whole finding was about. With object storage
unavailable at the moment of erasure, the erasure reports `completed` with
`objectsRemoved: 1`, deletes the household and the `documents` row holding the
storage key, and leaves the object in place — still containing the personal data
that was uploaded, now with nothing anywhere pointing at it and no retry possible
(FPR-003).

```
1. upload while minio UP  -> bucket: ffos, object present
2. confirm with minio DOWN -> 201, status completed, objectsRemoved 1
3. after minio recovery    -> object STILL PRESENT, household rows 0, documents rows 0
```

The cause is a chain of four forgiving steps: `PrivacyModule` provides its own
`ObjectStorageService`, so the delete is that instance's first storage call;
`ensureS3()` treats any failure as "use local storage" and caches it;
`deleteObject`'s local branch cannot tell a missing file from a deleted one; and
`removeStoredObjects` counts keys rather than confirmed deletions. Idempotence was
implemented as "never fail", which is exactly what defeats failing closed.

---

## Financial core

The identity that the last three audits turned on still holds:

```
[PASS] ACC-010 double-entry identity holds per household: households checked 122, breaks none
[PASS] ACC-011 product net worth equals opening positions plus income minus expenses: delta 0
[PASS] ACC-012 each step of the net worth series equals that period's income minus expenses
```

`ACC-005` is the one that fails, and it fails because of FPR-002 rather than
because of anything in the engine. The distinction matters for the next
remediation: this is a missing validation on the write path, not a mistake in the
arithmetic. Net worth, history, debt and cash are all still derived correctly for
every household that never held a mismatched-currency account.

The oracle was not modified. It still derives its own figures from the
double-entry identity and calls no product aggregation helper.

---

## What the next remediation should not do

- Do not rewrite the oracle to tolerate ACC-005. The violation is real.
- Do not fix FPR-001 by deleting the onboarding step without deciding what a
  household's currency means; either stop offering the choice or make the account
  form follow it, and give the households already stuck a way out.
- Do not fix FPR-003 by removing the local-storage fallback everywhere. The
  fallback is legitimate for a laptop; what is not legitimate is an erasure that
  reports success without confirming the object is gone.
- Do not add tests that assert the fix. All three blockers survived a green suite
  of 189 tests; the probes that found them are in `scripts/pilot/` and should be
  the gate.

---

## Reproducing this verdict

```bash
docker compose up -d --build          # the commit under test
python3 scripts/pilot/reacceptance-adversarial.py   # 17 checks, 9 pass, 8 fail
python3 scripts/pilot/reacceptance-secret.py        # 10 checks, 10 pass
python3 scripts/pilot/accounting-integrity.py       # ACC-005 fails once the above has run
```

`reacceptance-adversarial.py` leaves the mismatched postings it created in place
as evidence; they are the only ACC-005 violations in the database and they are
confined to households named `Uteslutet`.
