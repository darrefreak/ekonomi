# V1 Final Pilot Acceptance — Findings

Date: 2026-08-09
Scope: independent acceptance of the whole system for a **controlled pilot with
real household financial data**.
Method: fresh probes written for this audit (`scripts/pilot/`), deliberately not
reusing the arithmetic, the fixtures or the assertions the product and its
existing test suite share. Full method and results in
`V1_FINAL_PILOT_ACCEPTANCE.md`.

New finding IDs are prefixed `FPA`. Findings carried over from earlier audits
keep their original `RT` / `RT2` identifiers.

---

## Severity definitions used here

| Severity | Meaning for a real-data pilot |
|---|---|
| BLOCKER | A participant can lose data, see wrong money, or be locked out of the product; or an outsider can reach their data. Pilot must not start. |
| HIGH | A participant reliably hits a dead end on an advertised feature, or a legal obligation is unmet. Needs a fix or a written, agreed workaround before the pilot. |
| MEDIUM | Degrades trust or robustness; tolerable in a supervised pilot with known participants. |
| LOW | Cosmetic or long-horizon. |

---

## BLOCKER

### FPA-001 — A foreign-currency account permanently breaks the household's main screens

**Severity** BLOCKER
**Reproduce** `python3 scripts/pilot/data-robustness.py` (ROB-001, ROB-002, ROB-003)

The account form presents a currency selector, so choosing something other than
SEK is an ordinary, supported action from the participant's point of view. The
API accepts it:

```
POST /accounts  {"currency": "EUR", ...}   →  201 Created
```

Every aggregate surface then fails, permanently:

| Surface | Before | After one EUR account |
|---|---|---|
| `/dashboard` | 200 | **500** |
| `/net-worth` | 200 | **500** |
| `/insights` | 200 | **500** |
| `/forecast` | 200 | **500** |
| `/metrics/snapshots` | 200 | **500** |
| `/debt` | 200 | **500** |
| `/investments` | 200 | **500** |

The engine raises this deliberately — the V1 limitation itself is a reasonable
scope decision:

```186:194:apps/api/src/metrics/household-metrics.service.ts
    // V1: household position aggregation is SEK-only — never silent-cross-currency sum.
    for (const a of accountRows) {
      if (a.currency !== currency) {
        throw new Error(
          `V1 multi-currency aggregation unsupported: account ${a.id} is ${a.currency}, household base is ${currency}`,
        );
      }
    }
```

Three things turn a scope decision into a blocker:

1. **The limitation is not enforced where the data enters.** Account creation
   does not check the household base currency, so the product accepts input it
   knows it cannot process.
2. **The failure is an unhandled `Error`**, so participants get HTTP 500 rather
   than a message explaining what is wrong.
3. **It cannot be undone.** Deleting the account returns `200`, and the surfaces
   stay at 500. `getAccountRows` filters system accounts but not archived ones,
   so the archived account still reaches the guard:

```57:62:apps/api/src/metrics/household-metrics.service.ts
  async getAccountRows(householdId: string) {
    return getDb()
      .select()
      .from(accounts)
      .where(and(eq(accounts.householdId, householdId), ne(accounts.isSystem, true)));
  }
```

**Why this matters for a Swedish pilot** A Revolut account in euros, a Danish or
Norwegian account, or a USD brokerage are all ordinary holdings. The participant
selects the currency the product offered them, and their home screen never works
again. There is no in-product recovery and no warning beforehand.

**Suggested direction** Reject a mismatched currency at account creation with a
clear message (and hide or disable the selector until multi-currency is
supported); exclude archived accounts from the position query so the state is
recoverable; convert the engine's throw into a handled domain error.

---

### FPA-002 — The production secret guard accepts the placeholder this repository publishes

**Severity** BLOCKER
**Reproduce** `python3 scripts/pilot/security-probe.py` (SEC-017, SEC-018)

`requireAccessSecret` exists precisely to stop a deployment from running with a
development secret. It checks length only:

```1:10:apps/api/src/common/jwt-secrets.ts
export function requireAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_ACCESS_SECRET must be set (min 16 chars) in production",
    );
  }
  return secret && secret.length > 0 ? secret : "dev-access-secret-change-me";
}
```

The placeholder that `docker-compose.yml` and `.env.example` both supply is
`dev-access-secret-change-me` — 27 characters, so it passes:

```
NODE_ENV=production
ACCEPTED: "dev-access-secret-change-me"  (len 27)
ACCEPTED: "dev-refresh-secret-change-me" (len 28)
refused:  "change-me"        → must be set (min 16 chars)
refused:  <unset>            → must be set (min 16 chars)
```

The consequence, demonstrated rather than argued — a token signed with that
public string, for a user id read straight from the database:

```
FORGED TOKEN ACCEPTED: HTTP 200, households visible: ['Familjen Demo']
  net worth read with a forged token: 549834768 öre
```

Anyone who has seen this repository can mint a valid session for any user and
read every household's finances. The guard is the only thing standing between a
deployment mistake and that outcome, and it does not catch the specific mistake
it was written for.

Compounding it: there is **no production deployment artifact** in the
repository. `docker-compose.yml` is the only descriptor, and it supplies the
placeholder secrets, `POSTGRES_PASSWORD: ffos` and `MINIO_ROOT_PASSWORD:
ffossecret`. An operator standing up a pilot has nothing else to copy from.

**Suggested direction** Refuse a known-placeholder value explicitly (not just by
length), require meaningful entropy, and add a minimal production deployment
descriptor whose secrets must be supplied externally.

---

## HIGH

### FPA-003 — The Budget feature is unreachable for every real household

**Severity** HIGH (escalated from RT-005, previously MEDIUM)
**Reproduce** `python3 scripts/pilot/open-findings.py` (RT-005, RT-005b) and
`pilot-journey.py` (PILOT-004, PILOT-014)

`GET /budget` returns `404 Budget period not found` whenever the household has
no `budget_periods` row for the resolved month. Only the demo seed ever creates
one:

```
code paths that create a budget period: ['apps/api/src/db/seed/seed-planning.ts']
outside the seed: none
```

RT-005 was recorded as an empty-household edge case and deferred as MEDIUM. It
is neither. It reproduces on a household with five accounts, income, spending, a
mortgage payment and a vehicle, and no participant action can ever clear it,
because nothing outside the seed writes a budget period. Budget is a primary
navigation entry (`nav-config.ts`) and is linked from the dashboard, so every
pilot participant will click it and reach an error screen, permanently.

This is the same class as RT-012 ("no product path to create a vehicle for a
non-demo household"), which was rated HIGH and fixed.

---

### FPA-004 — The right to erasure is not implemented

**Severity** HIGH
**Evidence** code inspection; route inventory

`POST /privacy/delete-request` inserts a row with status `requested` and audits
it. Nothing ever processes it: `privacyRequests` is referenced only by
`privacy.service.ts` (insert and list), there is no job handler, no admin
endpoint and no script. The status never leaves `requested`.

There is also no way to delete a household or a user at all. The complete set of
`DELETE` routes is:

```
/api/v1/accounts/:id
/api/v1/households/:householdId/invitations/:invitationId
/api/v1/households/:householdId/members/:memberId
/api/v1/sources/:id
/api/v1/categories/:id
/api/v1/vehicle-candidates/:id
```

For a pilot holding real Swedish households' salary, debt and spending records,
an erasure request that is accepted and then silently never acted on is worse
than one that is refused: the participant is told their request is on file. Data
export (`POST /privacy/export`) does work and returns household data
synchronously.

**Note** A small controlled pilot can meet the obligation with a documented
manual procedure, but no such procedure exists in the repository, and nothing
surfaces pending requests to an operator.

---

## MEDIUM

### FPA-005 — Oversized amounts produce a server error instead of a validation error

**Severity** MEDIUM
**Reproduce** `data-robustness.py` (ROB-004)

| Input | Result |
|---|---|
| `9223372036854775807` (column maximum) | `201 Created` — an expense of 92 quadrillion kronor is booked |
| `92233720368547758070` | **`500` Internal server error** |
| `999999999999999999999999` | **`500` Internal server error** |

Negative, fractional, scientific-notation and non-numeric amounts are all
correctly refused with `400`. Only the magnitude case is unhandled. Combined
with the still-open RT-011 (no overdraft ceiling), a mistyped amount is accepted
without challenge and a slightly larger one crashes the request.

---

### FPA-006 — The password policy is length-only

**Severity** MEDIUM
**Reproduce** `security-probe.py` (SEC-011)

Registration validates `z.string().min(8).max(128)` and nothing else, so
`password` is accepted. There is no complexity rule, common-password denylist or
breach check. Mitigating factors are real: bcrypt at cost 12, no user
enumeration on login (`SEC-012`), and rate limiting in the product default. For
a pilot holding real financial data, a common-password denylist is a small
change with a large effect.

---

### FPA-007 — The only deployment descriptor is a development stack

**Severity** MEDIUM
**Reproduce** `security-probe.py` (SEC-014); inspection of `docker-compose.yml`

`docker-compose.yml` sets `FFOS_RATE_LIMIT: "2000"`, sixteen times the product
default of 120/minute. The value was introduced during RT2 remediation so that
an end-to-end run driving every page from one address would not be throttled,
and the code comment correctly says production leaves it unset — but nothing
enforces that, and this file is the only deployment descriptor in the
repository. On the running stack the effective limit is confirmed by
`X-RateLimit-Limit: 2000`, and 80 rapid authenticated requests were not
throttled at all.

The same file supplies the placeholder secrets described in FPA-002. Taken
together: a pilot deployed from the only available template is weaker than
intended in ways the templates themselves document but do not prevent.

---

### FPA-008 — Backup and restore are still untested tooling-wise, though the mechanism works

**Severity** MEDIUM (carries RT-015 forward)
**Evidence** restore drill performed during this audit

No `pg_dump`/`pg_restore` tooling, schedule or runbook exists anywhere in
`scripts/`, `infrastructure/` or `package.json` — backup remains documentation
only, as RT-015 recorded.

This audit performed the drill that had never been run. It succeeds:

| Check | Result |
|---|---|
| `pg_dump -Fc` of `ffos_dev`, restored into a scratch database | completed |
| users / households / accounts / events / postings / Σ amounts | `18/13/62/338/706/31033911224` before and after — identical |
| Unbalanced ledger entries in the restored copy | 0 |
| Households breaking the accounting identity in the restored copy | 0 |

So recovery is mechanically sound and integrity-preserving; the residual gap is
procedural — nothing schedules a backup, stores it off the host, or rehearses
the restore. For a pilot where participants type in months of data by hand, that
procedure is the difference between an incident and a loss.

---

## LOW / observations

### FPA-009 — Logging out leaves the access token usable until it expires

`logout` and `revoke-all` revoke refresh tokens only; there is no denylist for
access tokens, so a captured one stays valid for the remainder of its TTL
(15 minutes on the current stack). This follows the stateless design in
ADR-0003 and is a normal trade-off, but this is a *family* product where devices
are shared, and "log out" does not fully end access. Worth stating explicitly in
pilot material, or shortening the TTL.

### FPA-010 — `JWT_REFRESH_SECRET` is configured but never read

Refresh tokens are opaque random strings hashed in `refresh_tokens`, which is a
sound design. `JWT_REFRESH_SECRET` is set in `docker-compose.yml` and
`.env.example` but no code reads it. Harmless, and misleading to an operator
rotating secrets.

---

## Findings carried over from earlier audits — all still reproduce

Re-measured on a household built the way a participant builds one
(`scripts/pilot/open-findings.py`), not on seeded demo data.

| ID | Severity | Symptom now | Pilot impact |
|---|---|---|---|
| RT-006 | MEDIUM | Principal-only mortgage payment → `400`, `interestMinor` must be positive | A participant on an interest-free period or making an extra amortisation cannot record it |
| RT-007 | MEDIUM | 10 000 kr down payment on 1 000 kr cash → `201`, balance −900 000 öre | Silent impossible balances |
| RT-008 | MEDIUM | 4 of 5 manual accounts report `MISMATCH` | Every manual participant sees a permanent alarm that means nothing |
| RT-009 | LOW | `GET /transactions/:id` exposes no `splits` | A split can be recorded but not seen |
| RT-010 | LOW | `GET /households` after register → `[]` | First-run dead end unless the client creates one |
| RT-011 | MEDIUM | 50 000 000 kr expense on 1 000 kr cash → `201`, balance −4 999 900 000 öre | A mistyped amount silently wrecks every figure |
| RT-013 | MEDIUM | 0 opportunities generated on a thin household | Not reproduced, and still not evidence of a fix |
| RT-014 | COSMETIC | `/dashboard` → `404` | Guessable URL 404s |
| RT2-009 | LOW | Aggregates scale linearly with postings | Fine at pilot scale |
| RT2-010 | LOW | 404 page shows the English framework default | Untranslated in a Swedish product |

RT-005 is excluded from this table because it is escalated to FPA-003.

---

## What was verified as genuinely working

Recorded because an audit that lists only defects misrepresents the system.

| Area | Evidence |
|---|---|
| Double-entry integrity | Every entry balances; no single-sided, empty, cross-household or non-positive posting; no float money column anywhere (`ACC-001`…`ACC-009`) |
| Net worth correctness, derived independently | `Δ(assets − liabilities) = income − expenses` holds per household, against the product's own reported figure, and at every step of the history series (`ACC-010`…`ACC-012`) |
| RT2-001 corroborated from outside | Pristine demo net worth is **549 834 768 öre**, exactly the figure the RT2 red team independently expected before any fix existed |
| Clean-room financial arithmetic | Opening positions, a month of income and spending, principal neutrality, and vehicle onboarding all match explicit arithmetic exactly (`PILOT-007`, `PILOT-009`, `PILOT-010`, `PILOT-012`) |
| Surface agreement on real data | Dashboard, `/net-worth` and the metric registry agree with the independent oracle on a non-demo household (`PILOT-013`) |
| Tenancy isolation | 37 surfaces unreachable unauthenticated; an unrelated registered user leaks nothing by household id, object id, or write attempt; victim household provably unchanged (`SEC-001`…`SEC-006`) |
| Token handling | `alg=none`, rewritten subject, forged signature, garbage and Basic auth all rejected; a refresh token is not an access token (`SEC-007`, `SEC-008`) |
| Error hygiene and injection | No stack traces, SQL or connection strings in responses; injection payloads neither crash nor alter the schema (`SEC-009`, `SEC-010`) |
| Credential storage and enumeration | bcrypt cost 12; login answers identically for a wrong password and an unknown account (`SEC-012`, `SEC-013`) |
| Transport headers | CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options` all present (`SEC-015`) |
| Input robustness | Malformed amounts, impossible dates, markup, emoji and overlong text are all handled without a server error (`ROB-005`…`ROB-009`) |
| Recovery mechanism | Dump and restore round-trips byte-identically and preserves the accounting identity (FPA-008 table) |
| Build gates | `pnpm build`, `pnpm lint`, `pnpm typecheck` all pass; `pnpm test` runs 277 tests of which 106 are database-backed and counted |
