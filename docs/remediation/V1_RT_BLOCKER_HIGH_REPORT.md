# V1 Red Team Remediation — BLOCKER + HIGH

**Date:** 2026-08-08
**Branch:** `cursor/v1-rt-blocker-high-remediation-9c58`
**Scope:** the 1 BLOCKER and 3 HIGH findings from `docs/acceptance/V1_RED_TEAM_FINDINGS.md`, plus making mobile critical-path E2E actually execute.
**Explicitly out of scope:** all MEDIUM / LOW / COSMETIC findings.
**Reproduction log:** [`V1_RT_BH_REPRO.md`](./V1_RT_BH_REPRO.md)

This report records what was changed and how it was verified. It does **not**
declare a Red Team pass — that is decided by re-running V1 Red Team Acceptance.

---

## Result summary

| Finding | Severity | Status |
|---|---|---|
| RT-002 duplicate expense without `externalId`; `Idempotency-Key` ignored | BLOCKER | VERIFIED_FIXED |
| RT-001 global DEMO `asOf` pollution | HIGH | VERIFIED_FIXED |
| RT-004 net worth history doubles on the `asOf` day | HIGH | VERIFIED_FIXED |
| RT-012 no real vehicle create path | HIGH | VERIFIED_FIXED |
| RT-003 `Idempotency-Key` header ignored | MEDIUM | VERIFIED_FIXED (incidental — same boundary as RT-002) |
| Mobile critical-path E2E executability | process | VERIFIED_FIXED |

Each finding was marked VERIFIED_FIXED only after its **original** reproduction
from `V1_RED_TEAM_FINDINGS.md` stopped reproducing on a clean-room database.

---

## RT-002 (BLOCKER) — one intent, one economic effect

### The invariant

A command's identity is now separate from its source identity:

- `sourceExternalId` — the provider's id for an imported transaction.
- `idempotencyKey` — the client's id for one user submission.

Either resolves to a command key; both are stored in the same row but in
different namespaces, so a bank's `externalId` can never collide with a
browser's key.

### Changes

| Layer | Change |
|---|---|
| DB | `financial_command_idempotency.key_source` added; unique index is now `(household_id, command_type, key_source, external_id)` (`drizzle/0026_rt_remediation_clock_idempotency.sql`) |
| HTTP | `IdempotencyKey` param decorator reads and validates the `Idempotency-Key` header (`apps/api/src/common/idempotency-key.decorator.ts`) |
| Controller | every money-mutating `@Post` in `ledger.controller.ts` accepts the header |
| Service | `economic-events.service.ts` threads `idempotencyKey` into each command |
| Persistence | `persist-event.ts` resolves the command key (`idempotencyKey` wins over `externalId`), looks it up, and recovers from a unique violation |
| Client | `packages/api-client` sends the header; `apps/web/src/lib/idempotency.ts` (`useSubmissionKey`) issues one key per submission and renews it only on success |

The race is closed at the database, not in application code: concurrent writers
both attempt the insert, the loser catches the unique violation and returns the
winner's event.

### Semantics

| Request | Result |
|---|---|
| First request with a key | event created |
| Identical retry, same key | `201` with the **same** event id, no second posting |
| Same key, different payload | `409 IDEMPOTENCY_CONFLICT`, no economic effect |
| No key at all | accepted (unchanged behaviour, no regression) |

### Verification

`apps/api/src/ledger/rt-blocker-high.test.ts`: B1 identical retry, B2 six
concurrent same-key submissions, B3 payload conflict, B4 manual expense with no
`externalId`, B4b distinct keys still create two expenses, plus household
scoping of keys.

`e2e/idempotency.spec.ts` (chromium **and** mobile):

- **B5** double-tapping submit creates exactly one expense.
- **B5b** the browser's POST is intercepted and replayed verbatim, headers
  included — the gateway/network retry the header exists to survive.

B5b was mutation-tested: deleting `idempotency-key` from the replayed headers
makes it fail with `Received: 2`, which proves the test detects the original
defect rather than merely passing.

---

## RT-001 (HIGH) — the demo clock is no longer global

### Rule

```
explicit request asOf  →  household's own demo asOf  →  real application clock
```

`DEMO_AS_OF_DATE` is now seed configuration only. A demo household carries its
own frozen date in `households.demo_as_of`; `NULL` means "use the real clock",
so every real household gets today by construction rather than by exception.

### Changes

- `apps/api/src/common/as-of.ts` is the single clock abstraction:
  `currentAppDate()` (real date in `APP_TIME_ZONE`), `demoSeedAsOf()`
  (seed only), `resolveHouseholdAsOf()` (runtime), `FFOS_TEST_CLOCK_DATE`
  (tests only).
- `households.demo_as_of` column added and stamped by the demo seed.
- ~30 sites that inlined `process.env.DEMO_AS_OF_DATE` now resolve per household.
- Six controllers (`dashboard`, `net-worth`, `wealth`, `debt`, `reports`,
  `metrics`) stopped pre-resolving `asOf`, which had been defeating the
  household lookup — see RT-001b in the reproduction log.
- `resolveHouseholdAsOf` no longer swallows its read failure; a DB error fails
  the request instead of silently changing a household's financial date.

### Verification

| Case | Result |
|---|---|
| Demo household, no `asOf` | `2026-08-01` (its own frozen date) |
| New real household, no `asOf` | `2026-08-08` (real clock) |
| Explicit `asOf=2026-05-31` | honoured on both |
| Both households interleaved in one process | dates stay separate |

Unit tests cover all four. Because a resolver unit test cannot see a controller
that pre-resolves, `rt-blocker-high.test.ts` also walks every `*.controller.ts`
and fails if one calls the context-free `resolveAsOf`.

---

## RT-004 (HIGH) — net worth history buckets appear exactly once

### Canonical rule

For a requested series, **each date bucket appears exactly once**, and the value
for a bucket is the authoritative position at that cutoff. No separate "current"
value is appended when an equivalent bucket already exists.

### Root cause

`account_balance_snapshots` had several independent writers
(`ledger_reconstruct`, `nw_history_reconstruct`, `ledger_reconcile`,
`manual_opening`). On the `asOf` day two of them had each written a full
per-account set, and `netWorthHistoryFromSnapshots` summed every row it found —
so each account counted twice, giving exactly 2× current net worth.

### Changes

- `household-metrics.service.ts` now picks exactly one snapshot per
  `(account, calendar day)`, deterministically preferring the newest row, before
  summing.
- Migration `0026` deletes historical duplicate rows for the same
  `(account_id, source, day)`.

Timezone semantics are unchanged and were confirmed not to be the cause:
`as_of` is stored at `T12:00:00Z`, so `(as_of AT TIME ZONE 'UTC')::date` is
stable either side of midnight.

### Verification

`rt-blocker-high.test.ts`: NW1 single `asOf` bucket, NW2 same-day mutation
counted once, NW3 opening balance not duplicated, NW4 depreciation reduces net
worth once, NW5 a snapshot written near midnight stays in its own bucket.

Cross-surface agreement on the demo household at `asOf 2026-08-01`:

| Surface | Value (öre) |
|---|---|
| `GET /net-worth` current | 546 590 832 |
| final `/net-worth` history bucket | 546 590 832 |
| Metric Registry `net_worth` snapshot | 546 590 832 |
| Dashboard | 546 590 832 |
| AI `get_net_worth` | 546 590 832 |

---

## RT-012 (HIGH) — a household can add a vehicle

### The distinction that matters

Buying a car today and onboarding a car bought two years ago are different
economic events, and the create path treats them differently:

| Mode | Semantics |
|---|---|
| `NEW` + `CASH` | cash decreases, vehicle asset increases; **not** consumption |
| `NEW` + `FINANCED` | asset increases, down payment leaves cash, debt increases; loan proceeds are **not** income |
| `EXISTING` (any type) | opening position — establishes current value, debt and odometer with **no** current-period income or expense |
| `PRIVATE_LEASE` | routed to the lease model; creates no asset or loan account |

### Changes

- `packages/schemas/src/vehicles.ts`: `createVehicleSchema`, `updateVehicleSchema`,
  acquisition-mode and purchase-type enums.
- `POST /api/v1/vehicles` and `PATCH /api/v1/vehicles/:id`: household-scoped,
  Zod-validated, exact money, atomic, audit-logged, returning the full vehicle.
- `vehicles.service.ts` creates the vehicle plus ownership, usage profile,
  finance agreement and odometer reading, and books ledger events through
  `EconomicEventsService` only for a purchase happening now.
- `add-vehicle-form.tsx` with progressive disclosure, reached from a CTA on
  `/vehicles`; edit covers name, odometer and valuation.
- `EconomicEventsService` is injected via the `ECONOMIC_EVENTS_SERVICE` token to
  break a module cycle (`vehicles → ledger → jobs → vehicles`).

### Verification

`apps/api/src/vehicles/vehicles.create.test.ts`: onboarding uses opening
positions rather than current-period flows; cash purchase moves cash into the
asset without booking consumption; financed purchase books debt not income;
private lease creates no asset or loan account; edit changes valuation and
odometer without touching the ledger.

`e2e/vehicle-create.spec.ts` (chromium and mobile): onboard an already-owned
financed vehicle from the UI, check equity, refresh, confirm persistence and no
invented current-period transaction; plus a fresh cash purchase.

Onboarded equity is `value − debt − selling cost` = `6 500 000` öre for the
reproduction's 160 000 kr / 90 000 kr vehicle, and the household's cashflow
shows `spend 0 income 0`.

---

## Mobile E2E — real and reproducible

### Changes

- `pnpm test:e2e` now runs `--project=chromium --project=mobile`; the previous
  default ran desktop only, which is why mobile was "not re-proven".
- `test:e2e:desktop`, `test:e2e:mobile`, `test:e2e:docker`,
  `test:e2e:docker:mobile` added. The Docker variants use
  `mcr.microsoft.com/playwright:v1.62.1-jammy`, which resolves the host's
  missing `libatk-1.0.so.0` and the root-owned `test-results/` `EACCES`.
- `e2e/mobile-critical-paths.spec.ts` covers the mobile critical paths at
  iPhone-12 width: no horizontal overflow across home / transactions / more /
  settings / review, bottom navigation, the More overflow IA, account creation,
  transaction detail, and vehicle creation.

### A false pass found and fixed

The first version of the mobile spec navigated to `/money`, which does not
exist — the Money tab is `/transactions`. Next's not-found page still renders
the app shell, so overflow assertions passed against a 404. The spec now uses
the real routes and additionally asserts a heading is present, so a 404 cannot
satisfy it again.

### The previously skipped test

`critical path › mobile Mer overflow IA` was skipped only because the default
project was desktop. It now **passes** in the mobile project. The 7 remaining
skips are all mobile-gated tests correctly skipped in the desktop project; every
one of them runs and passes under `--project=mobile`.

---

## Verification runs

All commands run on this branch. The clean-room run is
`pnpm db:reset` (drop schema → migrate → seed) followed by creating a
non-demo household.

| Gate | Command | Result |
|---|---|---|
| Original repros (clean room) | `python3 scripts/rt-repro.py` | **13/13 PASS** |
| Unit + integration | `pnpm test` | **232 tests, 0 fail** (api 129, financial-engine 82, schemas 16, domain 4, utils 1) |
| API suite with full env | `pnpm --filter @ffos/api test` | **129 pass, 0 fail, 0 skipped** |
| E2E desktop + mobile | `pnpm test:e2e:docker` | **48 passed, 0 failed, 7 skipped** (mobile-gated in desktop project) |
| Lint | `pnpm lint` | PASS |
| Typecheck | `pnpm typecheck` | PASS |
| Build | `pnpm build` | PASS |
| Docker | `docker compose up -d --build api web worker` | PASS (api `/health` 200, web 200) |

Under `turbo` the two Redis-backed job tests skip because `REDIS_URL` is not in
the task environment; running the API package directly (which loads `.env`)
executes them, giving 129/129.

**Observed flake, recorded rather than hidden:** one API run failed a single
test while the `api`/`worker` containers were concurrently refreshing derived
caches against the same development database; the test name was not captured.
Five consecutive re-runs were clean (129/129 each). The DB-backed API tests
share the live dev database with the running stack, so this is contention in the
test environment rather than a product defect — but it does mean the API suite is
not fully isolated, which is worth fixing separately.

`scripts/rt-repro.py` replays the original reproduction steps rather than new
assertions, so it can be re-run by anyone:

```bash
pnpm db:reset
python3 scripts/rt-repro.py     # exits non-zero if any repro still reproduces
```

### P0 financial regression coverage

Re-run green as part of `pnpm test`: exact money, ledger truth and balanced
entries, atomic writes, R1 idempotency, splits, credit card, mortgage,
investment transfer, asset purchase, depreciation, reconciliation, Metric
Registry `inputHash`/`asOf`, and household isolation.

### Vehicle regression coverage

Re-run green: TCO, valuation, market, candidate comparison, replacement, lease,
depreciation and purchase semantics. The new create path feeds the same
services, with no demo-only assumptions.

---

## Findings incidentally resolved

**RT-003 (MEDIUM)** — "HTTP `Idempotency-Key` header ignored for ledger
mutations" shares its root cause with RT-002 and is fixed by the same boundary.
Status updated; it was not worked as a separate item.

No other MEDIUM / LOW / COSMETIC finding was touched.

## Remaining findings (not in this batch)

| Severity | Count | IDs |
|---|---|---|
| MEDIUM | 6 | RT-005, RT-006, RT-007, RT-008, RT-011, RT-013 |
| LOW | 3 | RT-009, RT-010, RT-015 |
| COSMETIC | 1 | RT-014 |

---

## Next step

**Re-run V1 Red Team Acceptance.** This batch does not self-accept.
