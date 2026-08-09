# V1 Final Targeted Pilot Re-acceptance — Findings

**Date** 2026-08-09
**Scope** the four blockers the remediation claimed to have fixed
(FPA-001 … FPA-004), re-tested from angles the remediation's own probes did not
use. Nothing else was re-audited.
**Verdict document** [`V1_FINAL_PILOT_REACCEPTANCE.md`](./V1_FINAL_PILOT_REACCEPTANCE.md)
**Probes** `scripts/pilot/reacceptance-adversarial.py`,
`scripts/pilot/reacceptance-secret.py`

## Severity definitions used here

| Severity | Meaning |
|---|---|
| BLOCKER | A participant can lose data, see wrong money, or be locked out of the product; or an outsider can reach their data. Pilot must not start. |
| HIGH | A participant reliably hits a dead end on an advertised feature, or a legal obligation is unmet. Needs a fix or a written, agreed workaround before the pilot. |
| MEDIUM | Degrades trust or robustness; tolerable in a supervised pilot with known participants. |
| LOW | Worth fixing, no participant consequence in a supervised pilot. |

## Summary

| Finding | Severity | Blocker it belongs to |
|---|---|---|
| FPR-001 the product offers a household base currency it then refuses to serve | BLOCKER | FPA-001 incomplete |
| FPR-002 a currency-excluded account stays writable, so money disappears from net worth | BLOCKER | FPA-001 incomplete |
| FPR-003 erasure reports success while the stored object survives, unrecoverably | BLOCKER | FPA-004 incomplete |
| FPR-004 concurrent confirmation leaves a dangling audit reference | LOW | FPA-004 |
| FPR-005 the test suite is green while all three blockers are live | observation | test trust |
| FPR-006 two remediation probes could stop the development API | observation | harness (fixed here) |
| FPR-007 one mobile navigation E2E test is intermittently flaky | observation | test trust |

**FPA-002 passed everything, including ten evasion attempts it had never seen.**
**FPA-003 passed everything, including concurrency it had never been tested under.**

---

## BLOCKER

### FPR-001 — The product offers a household base currency it then refuses to serve

**Severity** BLOCKER
**Belongs to** FPA-001, which is therefore not fully fixed
**Probe** `reacceptance-adversarial.py` RA-101, RA-102

The remediation removed the currency selector from the **account** form. It left
the currency selector on the **household** form one screen earlier.

`/onboarding` is a live page (`200`) whose step 2 is headed "Valuta" and offers
three choices:

```122:124:apps/web/src/components/onboarding/onboarding-page.tsx
            <option value="SEK">SEK</option>
            <option value="EUR">EUR</option>
            <option value="NOK">NOK</option>
```

Pick EUR or NOK and the household is created (`201`). The account form is then
hard-wired to SEK — it never reads the household it belongs to:

```34:37:apps/web/src/components/money/accounts-page.tsx
const INITIAL_FORM: FormState = {
  name: "",
  accountType: "CHECKING",
  currency: "SEK",
```

So every account the participant tries to open is refused by the guard the
remediation added:

```
[FAIL] RA-102 every base currency the product offers yields a household that can open an account:
       offered ['SEK', 'EUR', 'NOK'];
       unusable: ['EUR: account → 422, repair → 400', 'NOK: account → 422, repair → 400']
```

And there is no way back: `updateSettingsSchema` has no `baseCurrency` field, so
`PATCH /settings` returns `400`. The participant now owns a household that can
never hold an account, cannot be repaired in the product, and cannot be deleted
except through the erasure flow.

The account form also tells them something untrue — "Hushållet räknar sina summor
i SEK" — while the household counts in EUR.

**Why this is the same blocker.** FPA-001 was "unsupported currency can brick
household financial surfaces". The remediation closed the account door and left
the household door open, and the new guard is what slams shut behind whoever
walks through it. Before the fix, an EUR household with EUR accounts at least
aggregated; now it cannot hold an account at all.

**Either fix satisfies the probe.** Stop offering currencies the product cannot
serve, or make the account form follow the household's base currency (and give
existing stuck households a repair path). RA-102 iterates over whatever the
onboarding page offers, so it does not prescribe which.

---

### FPR-002 — A currency-excluded account stays writable, so money disappears from net worth

**Severity** BLOCKER
**Belongs to** FPA-001, which is therefore not fully fixed
**Probe** `reacceptance-adversarial.py` RA-103, RA-104, RA-105

FPA-001's chosen remedy for a foreign-currency row created before the guard is
to exclude it from the totals, warn, and offer archiving. The account is excluded
from **aggregation only**. It remains a fully writable account everywhere else.

Booking money onto it succeeds:

```
[FAIL] RA-103 money cannot be booked onto an account the totals refuse to include:
       expense → 201, income → 201
```

Two consequences, both financial.

**1. The ledger currency invariant breaks.** The postings are written in the
household's currency onto an account that holds another one, because every event
builder takes the currency from the request and never compares it with the
account:

```914:918:apps/api/src/ledger/economic-events.service.ts
    const draft = buildIncome({
      cashAccountId: input.cashAccountId,
      incomeAccountId,
      amountMinor: input.amountMinor,
      currency: input.currency ?? "SEK",
```

The independent oracle catches it — this is the first time `accounting-integrity.py`
has failed since the financial core was declared correct:

```
[FAIL] ACC-005 every posting matches its account's currency:
       postings whose currency differs from the account 6
```

All six violations are in households this probe created; the pre-existing data is
clean. The ledger write path itself is unchanged by the remediation — this gap
predates it — but FPA-001 turned it from unreachable-because-loud into reachable
and quiet.

**2. Net worth silently disagrees with the product's own income statement.** The
dashboard recognises the income; the balance sheet never moves, because the krona
landed on an excluded account:

```
[FAIL] RA-105 net worth moves by the income and expense the product recognises:
       recognised income 250000, ledger flow 150000 öre,
       net worth moved 0 öre (4200000 → 4200000)
```

Ledger truth for that household is opening 4 700 000 öre plus income 250 000
minus expenses 100 000 = **4 850 000 öre**. The product reports **4 200 000 öre**.
Of the 650 000 öre gap, 150 000 öre is economic activity recorded *in the
household's own base currency* that the product dropped on the floor.

Before the remediation this state returned `500` from seven surfaces: wrong, but
impossible to miss. Now the surfaces answer confidently with the wrong number.

**Suggested direction (not prescriptive).** Refuse writes to an account that
cannot be aggregated, and validate posting currency against the account in the
ledger write path so the invariant is enforced where it is defined rather than
only observed by the oracle.

---

### FPR-003 — Erasure reports success while the stored object survives, unrecoverably

**Severity** BLOCKER
**Belongs to** FPA-004, which is therefore not fully fixed
**Probe** `reacceptance-adversarial.py` RA-404, RA-405

`erasure.py` verifies object deletion with object storage healthy. With object
storage unavailable at the moment of erasure, the erasure reports success and the
personal data stays.

Deterministic reproduction, fresh API process:

```
1. upload while minio UP  -> bucket: ffos, object in minio: present
2. confirm with minio DOWN -> 201, status completed, objectsRemoved 1
3. after minio recovery    -> object: STILL PRESENT
   household rows: 0   documents rows: 0   request status: completed
```

The surviving object still holds what was uploaded:

```
$ docker exec ekonomi-minio-1 cat "/data/ffos/<key>/xl.meta" | strings | grep personnummer
personnummer 19900101-1234
```

The household row is gone, the `documents` row that held the storage key is gone,
and the request is `completed`. Nothing in the system can now find that object.
A retry is impossible — `execute()` returns early for a completed request — so
§30's "retry must continue safely" cannot be exercised, and §28's "erasure must
remove associated objects" is not met while the summary claims `objectsRemoved: 1`.

**Root cause, four links.**

1. `PrivacyModule` provides its **own** `ObjectStorageService` instance instead of
   importing the storage module, so the erasure path has its own cached S3 state
   and the delete is the first storage call it ever makes:

```12:12:apps/api/src/privacy/privacy.module.ts
  providers: [PrivacyService, ErasureService, ObjectStorageService],
```

2. `ensureS3()` treats any failure as "use local storage instead" and caches that
   for the life of the process:

```70:76:apps/api/src/storage/object-storage.service.ts
    } catch (err) {
      this.log.warn(
        `S3 unavailable (${err instanceof Error ? err.message : "error"}); using local storage`,
      );
      this.s3Ready = false;
      return false;
    }
```

3. `deleteObject` then removes a local path that was never there, and `force: true`
   plus the `catch` make that indistinguishable from success.

4. `removeStoredObjects` counts every key it looped over, regardless of what
   happened, and `execute()` proceeds to delete the rows holding the only pointer.

The same cached fallback has a second effect: after one transient outage the
process keeps using local storage until restarted, so `erasure.py`'s own ERA-012
started failing on a stack that had briefly lost MinIO.

**Suggested direction (not prescriptive).** Let storage failures fail the
erasure. Verify each delete (`objectExists` already exists and is unused here),
count only what is confirmed gone, and keep the request retryable — delete the
pointer rows only after the objects are provably removed.

---

## LOW

### FPR-004 — Concurrent confirmation leaves a dangling audit reference

**Severity** LOW
**Probe** `reacceptance-adversarial.py` RA-403, RA-406

Six simultaneous confirmations erase the household exactly once, which is the
important part and it passes. But one audit row from a losing racer is written
after the winner's scrub, so it keeps a household id that no longer exists:

```
[FAIL] RA-406 no table anywhere holds rows pointing at a household that no longer exists:
       60 household-scoped tables swept, dangling: audit_logs:1

  action: privacy.erasure_confirmed   after: {"status": "confirmed"}
```

The payload is a status string — no personal or financial data survives, so this
is a broken promise rather than a privacy incident. It contradicts
`docs/privacy/ERASURE.md` and ERA-015's "rows still tied to the household 0",
both of which hold for sequential erasure. The whole-schema sweep is clean apart
from this row.

---

## Observations

### FPR-005 — The test suite is green while all three blockers are live

189 tests pass, 115 of them database-backed, with FPR-001, FPR-002 and FPR-003 all
reproducible against the same commit. Every new test the remediation added asserts
the path the author had in mind: object deletion with storage up, budget retries in
sequence, a EUR account in a SEK household but never a SEK account in a EUR one.
This is the same pattern the RT2 audit named — tests that confirm the intent
rather than probe the boundary — and it is why re-acceptance is run with fresh
adversarial probes rather than by reading the suite.

### FPR-006 — Two remediation probes could stop the development API

`production-secret.py` and (as first written) `reacceptance-secret.py` cleaned up
a timed-out `docker compose run` with `docker compose rm -f -s api`, which stops
the shared development `api` container rather than the throwaway one. It took the
stack down mid-run. Both now name their throwaway container and remove only that.
Probe-harness only; no product code involved.

### FPR-007 — One mobile navigation E2E test is intermittently flaky

`route-contract.spec.ts` "mobile bottom navigation and More menu hrefs all
resolve" failed once at 1.1 s and passed on the next two full runs at 3.5–3.7 s,
including in isolation. Timing under parallel load, not a regression. Worth a
wait-for rather than leaving it to chance.

---

## What was re-verified as genuinely working

| Claim | Evidence |
|---|---|
| FPA-002 rejects placeholders it has never seen | 10/10 evasion attempts refused: upper-cased placeholder, placeholder with a production suffix, renamed default, 64×`a`, `abab`×16, digit runs, `production`×5, and a placeholder refresh secret |
| FPA-002 is discriminating, not blanket | a generated secret and the documented `openssl rand -base64 48` both start normally |
| FPA-003 survives concurrency | 8 simultaneous first-budget submissions → 1 period, 6 lines; 8 simultaneous month-boundary reads → exactly 1 rollover |
| FPA-003 survives gaps | a budget last touched in May resolves to August on first read |
| FPA-003 isolation | a stranger creating a budget in another household → `403` |
| FPA-004 authorization | `ADULT` → `403`; `ADMIN` → `403` ("Only an owner can erase a household"); household intact both times |
| FPA-004 idempotency | 6 simultaneous owner confirmations → household erased once, one completed request |
| FPA-001 doors that are shut | an account's currency cannot be changed after creation (`400`); a household's base currency cannot be switched under existing accounts (`400`) |
| Ledger identity | ACC-010 holds across 122 households; ACC-011 delta 0; ACC-012 across every step |
| Household isolation | 37 surfaces, no leaks (`security-probe.py` unchanged) |
