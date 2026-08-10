# V1 Red Team — BLOCKER/HIGH Reproduction Log

**Date:** 2026-08-08  
**Branch:** `cursor/v1-rt-blocker-high-remediation-9c58`  
**Rule:** no fix is implemented for a finding that is not first reproduced or proven from code.  
**Environment:** docker compose stack (api 3001, web 3000, postgres 5436), demo seed loaded.

Scope of this batch: **RT-002 (BLOCKER), RT-001, RT-004, RT-012 (HIGH)** plus mobile E2E executability.

---

## RT-002 — BLOCKER — Duplicate expense without `externalId`; `Idempotency-Key` ignored

**Severity:** BLOCKER

**Exact reproduction**

```bash
API=http://localhost:3001/api/v1
TOKEN=... # login demo@ffos.local / demo-password-123 → tokens.accessToken
BODY='{"householdId":"<hid>","cashAccountId":"<cash>","amountMinor":"11100","occurredOn":"2026-07-18","description":"Double tap"}'

curl -s -X POST "$API/ledger/expenses" -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -H 'Idempotency-Key: rt-key-1' -d "$BODY"
curl -s -X POST "$API/ledger/expenses" -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -H 'Idempotency-Key: rt-key-1' -d "$BODY"
```

**Expected:** second call returns the first event; exactly one financial event, one ledger entry, one posting pair, one cash effect.

**Actual (observed):**

```
dup header 201 40147d55-1156-42f9-83b8-9375b20a8001
           201 d5599fcd-2b38-46f5-927c-d614390165d8
```

Two distinct `financial_events` → duplicate economic effect. Control case with body `externalId` returns the **same** id (`ce316449-…` twice), proving idempotency exists but is reachable only through source identity.

**Root cause (proven from code)**

- `apps/api/src/db/seed/persist-event.ts` gates the whole idempotency path on `if (input.externalId)` (lines 202 and 380). No key → no lookup, no `financial_command_idempotency` row, no unique-violation recovery.
- No Nest middleware/interceptor or controller parameter reads the `Idempotency-Key` header anywhere: `rg "Idempotency-Key|idempotency-key" apps/api/src` matches nothing.
- `apps/api/src/ledger/ledger.controller.ts` passes only `input.externalId` through for a subset of commands; expense/income/credit-card/mortgage/investment/refund paths have no command-identity parameter at all.

**Affected code**

| File | Role |
|---|---|
| `apps/api/src/db/seed/persist-event.ts` | idempotency lookup/insert gated on `externalId` |
| `apps/api/src/ledger/ledger.controller.ts` | no header plumbing |
| `apps/api/src/ledger/economic-events.service.ts` | command builders drop identity |
| `packages/schemas/src/ledger.ts` | only `externalId` on some commands |
| `apps/web/src/lib/api.ts` | client sends no idempotency key |

**Affected database rows:** `financial_events`, `ledger_entries`, `ledger_postings`, `source_transactions`, `source_transaction_links`, `financial_command_idempotency` (row absent).

**Affected metric/UI surfaces:** period spending, savings rate, cash balance, dashboard `thisMonth`, cashflow, net worth, transactions list.

**Race exposure:** even with a lookup, two concurrent requests could both miss. `financial_command_idempotency` already carries `uniqueIndex(household_id, command_type, external_id)`, which is the correct DB race protection but is only exercised when a key exists.

---

## RT-001 — HIGH — Global DEMO `asOf` pollution

**Severity:** HIGH

**Exact reproduction**

```bash
# brand new user + household, never demo-seeded
curl -s -X POST "$API/auth/register" -d '{"email":"rt-…@example.com","password":"TestPassword123!","displayName":"Empty"}'
curl -s -X POST "$API/households" -H "authorization: Bearer $T" -d '{"name":"Empty RT HH"}'
curl -s "$API/dashboard?householdId=$HID" -H "authorization: Bearer $T"   # no asOf query
```

**Expected:** `asOf` = real current date (2026-08-08 at audit time) for a household that has nothing to do with the demo.

**Actual:** `{"greeting":"God eftermiddag","asOf":"2026-08-01","householdName":"Empty RT HH", …}` — the demo freeze date.

**Root cause (proven from code)**

```ts
// apps/api/src/common/as-of.ts
export function resolveAsOf(asOf?: string | null): string {
  return asOf ?? process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
}
```

`DEMO_AS_OF_DATE=2026-08-01` is set globally for api **and** worker in `docker-compose.yml` (lines 74, 95) and `.env.example`. The same expression is additionally inlined in ~30 runtime services.

**Classification of every runtime use** (`rg "DEMO_AS_OF_DATE|resolveAsOf"`):

| Site | Class |
|---|---|
| `db/seed/demo-household.ts:83` | SEED_ONLY (legitimate) |
| `demo/demo.controller.ts:17` | DEMO_HOUSEHOLD_ONLY (legitimate, demo descriptor) |
| `*.test.ts` occurrences | TEST_ONLY (legitimate) |
| `common/as-of.ts` + dashboard, net-worth, metrics, wealth, debt, reports, cashflow, vehicles, vehicle-intel, planning (budget/goals/sinking-funds/contracts/subscriptions), intake, decisions, anomaly, advisor, accounts, ledger controller/service/truth, coverage, jobs handlers/queue | **INVALID_GLOBAL_RUNTIME_USAGE** (30 sites) |

**Affected database rows:** none directly — but every derived write keyed by `asOf` (`account_balance_snapshots.as_of`, `metric_snapshots`, `analysis_runs`, budget periods) is stamped with the demo date for real households.

**Affected surfaces:** dashboard, net worth, wealth, cashflow, budget, goals, forecast, decisions, advisor brief, vehicles, coverage, reports, all background jobs.

---

### RT-001b — second-order defect found by the clean-room test

The first RT-001 fix moved clock resolution into services
(`resolveHouseholdAsOf(householdId, asOfInput)`), but the clean-room re-run
(`pnpm db:reset` → `python3 scripts/rt-repro.py`) showed the demo household
reporting `asOf: 2026-08-08` instead of its own `2026-08-01`.

**Root cause:** six controllers still resolved the clock *before* calling the
service:

```ts
// apps/api/src/dashboard/dashboard.controller.ts (before)
return this.dashboard.getDashboard(user.userId, query.householdId, resolveAsOf(query.asOf));
```

`resolveAsOf` has no household context, so a missing `asOf` became today's date
and the service's household lookup could never run — the inverse of the original
bug, and equally wrong. Affected: `dashboard`, `net-worth`, `wealth`, `debt`,
`reports`, `metrics` controllers, plus `reports.service.ts` which used the
context-free resolver directly.

A second hazard was found in the same pass: `resolveHouseholdAsOf` wrapped its
household read in `try { … } catch { demoAsOf = null }`, so any transient read
failure silently moved a household's financial date to today.

**Guard added:** `rt-blocker-high.test.ts` now walks every `*.controller.ts` and
fails if any of them calls `resolveAsOf`, because a unit test of the resolver
cannot see this class of defect.

---

## RT-004 — HIGH — Net Worth history doubles on the `asOf` day

**Severity:** HIGH

**Exact reproduction**

```bash
curl -s "$API/net-worth?householdId=<demo-hid>" -H "authorization: Bearer $T" | jq '.history'
```

**Expected:** the final bucket equals the current authoritative net worth (`546 634 232` öre).

**Actual:**

```
2026-04-30  541220500
2026-05-31  547558300
2026-06-30  553935816
2026-07-31  546634232
2026-08-01 1093268464   ← exactly 2 × current
```

**Root cause (proven — SQL + code)**

```sql
SELECT (as_of AT TIME ZONE 'UTC')::date AS d, source, count(*) rows, count(DISTINCT account_id) accts
FROM account_balance_snapshots s JOIN households h ON h.id=s.household_id
WHERE h.name='Familjen Demo' GROUP BY 1,2 ORDER BY 1 DESC;

     d      |         source         | rows | accts
 2026-08-01 | ledger_reconstruct     |   10 |    10
 2026-08-01 | nw_history_reconstruct |   10 |    10
 2026-07-31 | nw_history_reconstruct |   10 |    10
 …
```

`HouseholdMetricsService.netWorthHistoryFromSnapshots` (`apps/api/src/metrics/household-metrics.service.ts:309-352`) selects **all** snapshot rows for the household and buckets them by calendar date **without deduplicating per account**:

```ts
const list = byDate.get(key) ?? [];
list.push({ accountType: row.accountType, balanceMinor: row.balanceMinor ?? 0n });
```

On the asOf day two independent writers have both produced a full set of per-account rows — the seed's `ledger_reconstruct` (`demo-household.ts:950`) and `ensureNetWorthHistorySnapshots`' `nw_history_reconstruct`. Each account is therefore summed twice → exactly 2×. `ledger_reconcile` (from `refreshDerivedCaches`) and `manual_opening` (from `AccountsService.create`) are two further sources that can collide on the same day, and `manual_opening` also injects stray non-month-end buckets.

This is the “opening/current snapshot appended to an already-complete series” class of bug, not a timezone bug: `asOf` is stored at `T12:00:00Z`, so `(as_of AT TIME ZONE 'UTC')::date` is stable.

**Affected database rows:** `account_balance_snapshots` — multiple `(account_id, as_of::date)` rows with different `source`.

**Affected surfaces:** `/net-worth` history array, wealth trend chart, any consumer of the history series. Current headline NW is computed separately and stays correct, so the UI self-contradicts.

---

## RT-012 — HIGH — No real vehicle create path

**Severity:** HIGH

**Exact reproduction**

```bash
curl -s -X POST "$API/vehicles" -H "authorization: Bearer $T" \
  -d '{"householdId":"…","make":"VW","model":"Golf","year":2018, …}'
# → 404 {"code":"NOT_FOUND","message":"Cannot POST /api/v1/vehicles"}
curl -s -X POST "$API/households/$HID/vehicles" …   # → 404
```

**Expected:** a household can add a vehicle through the product.

**Actual:** no create route exists, and the UI offers no entry point.

**Root cause (proven from code)**

- `apps/api/src/vehicles/vehicles.controller.ts` declares only `@Get()` and `@Get(":id")`.
- The only `insert(vehicles)` in the codebase is `apps/api/src/db/seed/seed-vehicles.ts:23`.
- `apps/web/src/components/vehicles/vehicles-page.tsx:48-53` renders `EmptyState` with the text “Lägg till ett fordon…” and **no** action/CTA.
- `packages/schemas/src/vehicles.ts` has no create schema.
- Related dependency: `POST /ledger/assets/financed-purchase` requires `vehicleId`, so the financed-vehicle ledger path is unreachable without a vehicle row.

**Affected database rows:** `vehicles`, `vehicle_ownerships`, `vehicle_usage_profiles`, `vehicle_finance_agreements`, `vehicle_odometer_readings`, `vehicle_cost_events` — all seed-only for a real household.

**Affected surfaces:** `/vehicles`, `/vehicles/:id`, costs, valuation, market, candidates, compare, replacement, lease, TCO, equity, vehicle AI/decision tools.

---

## Mobile E2E executability

**Severity:** process defect (blocks re-proving mobile real-use)

**Reproduction**

```bash
pnpm test:e2e            # → playwright test --project=chromium
pnpm exec playwright test e2e/critical-path.spec.ts -g "mobile Mer" --project=mobile
```

**Expected:** the mobile project runs the mobile-only tests.

**Actual (two independent blockers):**

1. Default script is chromium-only, so `critical path › mobile Mer overflow IA` and `p1-u1-workflows › mobile accounts form usable at 375` always report *skipped*.
2. Executing `--project=mobile` in this environment fails before any test:
   `chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file`, plus `EACCES` on a root-owned `test-results/.last-run.json`.

**Root cause:** `playwright.config.ts` does define a `mobile` project (iPhone 12), but nothing in the repo scripts or docs runs it as part of acceptance, and the containerised runner (`test:e2e:docker`) runs all projects but is not the documented default. Host browser dependencies are not installed.

**Affected surfaces:** mobile acceptance evidence only — no product code.

---

## Summary

| ID | Reproduced | Root cause proven | Ready to fix |
|---|---|---|---|
| RT-002 | Yes | Yes — idempotency gated on `externalId`, header unread | Yes |
| RT-001 | Yes | Yes — `resolveAsOf` env default + 30 inlined sites | Yes |
| RT-004 | Yes | Yes — per-account duplicate snapshot rows per date | Yes |
| RT-012 | Yes | Yes — no create route, seed-only insert, no UI CTA | Yes |
| Mobile E2E | Yes | Yes — chromium-only default + missing browser deps | Yes |
