# Final Pilot Blockers — Reproduction Log

Date: 2026-08-09, before any remediation.
Stack: `docker compose` development stack, `ffos_dev`, API on `:3001`, web on `:3000`.
Method: the five probes under `scripts/pilot/`, unchanged, plus one manual
reproduction for FPA-004 (which has no probe yet).

The probes are recorded here as they stood at the acceptance audit. They are not
replaced or weakened by this remediation; the same five must pass afterwards.

## Baseline probe results

| Probe | Result before remediation |
|---|---|
| `accounting-integrity.py` | **12 / 12** — the financial core is already correct and must stay that way |
| `pilot-journey.py` | 13 / 16 |
| `security-probe.py` | 14 / 18 |
| `data-robustness.py` | 5 / 9 |
| `open-findings.py` | 1 / 12 |

Only the failures belonging to the four blockers are in scope. The other
failures (RT-006 through RT-015, SEC-011, SEC-014, ROB-004, PILOT-002/RT-010)
are deliberately left alone.

---

## FPA-001 — Unsupported currency bricks the household

**Probe** `scripts/pilot/data-robustness.py`

```
[FAIL] ROB-001 an account in a currency the engine cannot aggregate is refused at creation:
       creating a EUR account in a SEK household → 201
[FAIL] ROB-002 the participant's surfaces keep working after that account exists:
       surfaces that stopped answering: [('/dashboard', 500), ('/net-worth', 500),
       ('/insights', 500), ('/forecast', 500), ('/metrics/snapshots', 500),
       ('/debt', 500), ('/investments', 500)]
[FAIL] ROB-003 removing the offending account restores the participant's surfaces:
       delete → 200, still failing afterwards: [('/dashboard', 500), ('/net-worth', 500),
       ('/insights', 500), ('/forecast', 500), ('/metrics/snapshots', 500),
       ('/debt', 500), ('/investments', 500)]
```

**Expected** Account creation refuses a currency the engine cannot aggregate, or
aggregation tolerates it. Either way the dashboard keeps working.

**Actual** Creation returns `201`. Seven aggregate surfaces then return `500`
permanently. Deleting the account returns `200` and changes nothing.

**Root cause** Three separate gaps:

1. `accounts.service.ts` does not compare the requested currency with the
   household base currency, so unsupported state can be created.
2. `HouseholdMetricsService.assertSingleCurrency` throws a bare `Error`, which
   Nest renders as `500`, instead of a domain error the UI can act on.
3. `getAccountRows` filters `isSystem` but not `archivedAt`, so an archived
   account still reaches the guard and the state is unrecoverable.

```57:62:apps/api/src/metrics/household-metrics.service.ts
  async getAccountRows(householdId: string) {
    return getDb()
      .select()
      .from(accounts)
      .where(and(eq(accounts.householdId, householdId), ne(accounts.isSystem, true)));
  }
```

**Test coverage before the fix** None. No test creates an account whose currency
differs from the household base currency.

---

## FPA-002 — The production secret guard accepts the published placeholder

**Probe** `scripts/pilot/security-probe.py`

```
[FAIL] SEC-017 the production guard refuses the placeholder secrets this repository publishes:
       accepted in production ['dev-access-secret-change-me', 'dev-refresh-secret-change-me']
[FAIL] SEC-018 a token signed with the published placeholder is not accepted:
       forged token against /households → 200, exposing ['Familjen Demo']
```

**Expected** A production process refuses to start with a known development
secret, and a token signed with it is rejected.

**Actual** `requireAccessSecret` accepts any value of 16 characters or more. The
placeholder in `docker-compose.yml` and `.env.example` is
`dev-access-secret-change-me`, 27 characters, so it passes. A token signed with
that public string was accepted and used to read a household's net worth.

**Root cause** The guard tests length, not whether the value is a known
placeholder:

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

**Test coverage before the fix** One test, `requireAccessSecret fails closed in
production without secret`, covers the unset case only. Nothing covers a
placeholder or a weak value.

---

## FPA-003 — Budget never bootstraps for a real household

**Probes** `scripts/pilot/open-findings.py`, `scripts/pilot/pilot-journey.py`

```
[FAIL] RT-005  the Budget surface answers for a household the participant built:
       GET /budget → 404 Budget period not found
[FAIL] RT-005b a product path exists to create a budget period:
       code paths that create a budget period: ['apps/api/src/db/seed/seed-planning.ts'];
       outside the seed: none
[FAIL] PILOT-004 every product surface answers for a brand-new empty household:
       surfaces 39, failing ['/budget → 404 None']
[FAIL] PILOT-014 every product surface still answers once the household holds real data:
       failing ['/budget → 404']
```

**Expected** A household with no budget gets a usable empty state and can create
one.

**Actual** `404 Budget period not found`, on an empty household and equally on a
household with five accounts, income, spending, a mortgage payment and a
vehicle. Budget is a primary navigation entry, so this is a permanent dead end
for every participant.

**Root cause** `BudgetService.get` throws `NotFoundException` when
`getBudget` returns null, and only the demo seed ever inserts a
`budget_periods` row. There is no create endpoint.

**Test coverage before the fix** Budget tests run against the seeded demo
household, which always has a period, so the gap is invisible to them.

---

## FPA-004 — Erasure requests cannot be executed

**Reproduction** manual; recorded in full below.

```
household 7fc6ea2e-9e35-43a8-81f2-69971ffbf502 created with an account and a transaction
POST /privacy/delete-request -> 201 {"kind": "delete_household", "status": "requested"}
GET  /privacy/requests       -> 200 {"items":[{"kind":"delete_household","status":"requested"}]}

after the erasure request, data still present:
  accounts:         2
  financial_events: 1
  ledger_postings:  2
  household still readable: 200
  DELETE /households route exists: 404
```

**Expected** An accepted erasure request results in the data being erased, or at
minimum in an operator-executable workflow.

**Actual** A row is inserted with status `requested` and nothing ever changes
it. The participant is told the request is on file; the data stays. There is no
route to delete a household or a user.

**Root cause** `PrivacyService.requestDelete` inserts and audits, and no code
anywhere reads `privacyRequests` except the list endpoint. No job handler, no
admin endpoint, no script. The complete `DELETE` route inventory contains no
household or user deletion.

**Test coverage before the fix** `privacy.integration.test.ts` asserts that a
request row is created. Nothing asserts that anything is erased.

---

## The gate this remediation must not break

`scripts/pilot/accounting-integrity.py` passes **12 / 12** at baseline,
including the identity that matters:

```
[PASS] ACC-010 double-entry identity holds per household:
       Δ(assets−liabilities) = income − expenses: households checked 23, breaks none
[PASS] ACC-011 product net worth equals opening positions plus income minus expenses: delta 0
[PASS] ACC-012 each step of the net worth series equals that period's income minus expenses
```

This derivation does not call product aggregation helpers and must not be
changed to do so. It is re-run after each of the four fixes.
