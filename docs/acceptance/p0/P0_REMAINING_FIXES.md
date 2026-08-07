# P0 Remaining Fixes (Do Not Implement in This Audit)

Narrow, acceptance-blocking fixes only. No P1 product expansion.

---

## P0-A1 — Ledger persist atomicity

**Problem:** `persistBalancedEvent` performs sequential inserts (event → entry → postings → recon → source txs → splits) with **no** `db.transaction`. Mid-failure can leave half-written economic state.

**Fix scope:**
- Wrap `persistBalancedEvent` body in a single Postgres transaction.
- Add a failure-injection / rollback unit or integration test (force posting insert failure → assert zero residual rows).

**Files:** `apps/api/src/db/seed/persist-event.ts`

---

## P0-A2 — Depreciation idempotency

**Problem:** `createAssetDepreciation` sets `externalId` but creates **no** `source_transactions` row, so idempotency lookup never hits. Retry doubles write-down (proven: 300k → 280k on two 10k calls with same key).

**Fix scope:**
- Persist a non-cash source/idempotency record keyed by `(householdId, externalId)`, **or** look up existing `financial_events` by a durable external key.
- Reject / return existing event on retry.
- Add persisted test: same externalId → same event id, balance unchanged on second call.

**Files:** `economic-events.service.ts`, `persist-event.ts`, depreciation invariants test

---

## P0-A3 — Document extract float money

**Problem:** `mock-extract.ts` uses `BigInt(Math.round(Number(raw) * 100))` and persists `amountMinor`.

**Fix scope:**
- Parse major units with `kronorStringToMinor` (or equivalent digit split).
- Reject malformed OCR amounts rather than float-round.
- Add negative test for scientific / float strings.

**Files:** `apps/api/src/intake/mock-extract.ts`

---

## P0-A4 — P0-7 product path gaps

**Problem:** Refund exists only as service; general category splits have schema but no write API; no UI/client for ledger mutations.

**Fix scope (minimum):**
1. `POST /api/v1/ledger/refunds` (or equivalent) wired to `createCashRefund` with Zod + authz.
2. Persist/read path for category splits that uses `transactionSplitsSchema` and runs inside the P0-A1 transaction.
3. At least one api-client method + one UI or E2E path that exercises split or refund (minimal).

Do **not** expand into full recon UX beyond making mismatch already shown remain correct.

---

## P0-A5 — Ledger truth residuals (P0-1)

**Problem:** Some read surfaces still trust cache or stale history.

**Fix scope:**
- Accounts list: expose ledger-aligned balance (or clearly label cache vs ledger; acceptance prefers ledger).
- Debt detail / mortgage context: use `getLedgerAlignedAccountRows` (or reconstruct) for outstanding.
- NW history: refresh or invalidate `account_balance_snapshots` for affected dates after ledger mutations (not insert-only).

---

## P0-A6 — Metric registry integrity (P0-8)

**Problem:** Weak `inputHash`; bundle version stuffed into per-metric meta; hardcoded asOf; yearly fake hash; no historical version serve.

**Fix scope:**
- Strengthen `inputHash` with posting aggregate fingerprint (e.g. count + sum of amountMinor + max bookedOn) or event max(updatedAt).
- Set `metricMeta.calculationVersion` from relevant metric defs (or expose both bundle + metric versions).
- Accept `asOf` on dashboard/NW/debt/wealth (or document single global asOf policy and enforce it everywhere).
- Remove fabricated yearly `inputHash`; derive from period inputs.
- Optional: read path that returns stored snapshot for a requested `(metricKey, calculationVersion, asOf)` without silent recompute under a newer formula.

---

## P0-A7 — Vehicle purchase / financed purchase runtime

**Problem:** Cash purchase builder is unit-only; seed uses openings; financed purchase has no ledger builder.

**Fix scope:**
- Runtime `createAssetPurchase` (cash) via domain command + API.
- Financed purchase builder: vehicle asset + cash down + loan liability in one balanced event (or documented two-step with invariants).
- Seed should prefer events over silent openings where claiming purchase semantics.

---

## P0-A8 — Reversal / correction

**Problem:** Status enum unused for economics.

**Fix scope (minimum V1):**
- Define behavior: REVERSED/CORRECTED excluded from reconstruct **or** paired reversing postings.
- Enforce in reconstruct + metrics period totals.
- Tests: reverse must not leave spend; correct must not double-count.

---

## Suggested fix order

1. **P0-A1** atomicity (prevents corruption class)  
2. **P0-A2** depreciation idempotency  
3. **P0-A3** float extract  
4. **P0-A5** ledger-aligned reads / history invalidation  
5. **P0-A4** refund HTTP + split persist  
6. **P0-A6** metric hash/asOf  
7. **P0-A7** vehicle purchase paths  
8. **P0-A8** reversal semantics  

Stop after listing. Implement only when a dedicated fix batch is instructed.
