# R1 — Current Atomicity Audit (pre-fix baseline)

**Date:** 2026-08-08  
**Branch:** `cursor/batch-r1-atomic-idempotency-9c58`  
**Scope:** Multi-write financial commands only (P0-A1 / P0-A2 class). No P1/P2/P3.

Classifications: `ATOMIC` | `PARTIAL_RISK` | `NON_ATOMIC` | `IDEMPOTENT` | `NON_IDEMPOTENT` | `UNKNOWN`

---

## Legend

| Tag | Meaning |
|---|---|
| NON_ATOMIC | Multiple writes without a shared DB transaction |
| PARTIAL_RISK | Multi-write; may use txn for some paths but not all, or audit/cache split |
| ATOMIC | All economic writes in one Postgres transaction |
| IDEMPOTENT | Stable key + DB uniqueness; identical retry returns existing / no second effect |
| NON_IDEMPOTENT | Retry can double-apply economics |
| UNKNOWN | Path incomplete / no runtime write surface |

---

## Persist core

| Command / path | Files / functions | Atomicity | Idempotency | Notes |
|---|---|---|---|---|
| **Ledger persist (shared)** | `apps/api/src/db/seed/persist-event.ts` → `persistBalancedEvent` | **NON_ATOMIC** | **PARTIAL** | Sequential inserts: event → entry → postings → recon → source txs → links → splits. **No** `db.transaction`. Idempotency only if `sourceAccountId` creates `source_transactions` and lookup hits `(householdId, externalId)` — unique index is actually `(householdId, accountId, externalId)`. |
| Seed demo events | `apps/api/src/db/seed/demo-household.ts` → `persistBalancedEvent` | **NON_ATOMIC** | **PARTIAL** | Same persist path. |

---

## Domain commands (`EconomicEventsService`)

| Command | Function | Atomicity | Idempotency | Notes |
|---|---|---|---|---|
| Internal transfer | `createInternalTransfer` → `persistDraft` | **NON_ATOMIC** | **IDEMPOTENT** (happy path) | Creates source + counterpart txs; retry via `externalId` works when source row exists. Race unprotected by app-level find-before-insert alone. |
| Credit-card purchase | `createCreditCardPurchase` | **NON_ATOMIC** | **NON_IDEMPOTENT** | No caller `externalId`; each call new event. |
| Credit-card payment | `createCreditCardPayment` | **NON_ATOMIC** | **NON_IDEMPOTENT** | No `externalId` param. |
| Mortgage split | `createMortgagePayment` (+ splits) | **NON_ATOMIC** | **NON_IDEMPOTENT** | Splits written after postings; mid-fail → partial. |
| Investment transfer | `createInvestmentTransfer` | **NON_ATOMIC** | **NON_IDEMPOTENT** | No `externalId`. |
| Cash refund | `createCashRefund` | **NON_ATOMIC** | **NON_IDEMPOTENT** | Service-only (no HTTP in V1). |
| Asset depreciation | `createAssetDepreciation` | **NON_ATOMIC** | **NON_IDEMPOTENT** | Sets `externalId` but **no** `sourceAccountId` → idempotency lookup never hits. Proven double write-down (P0-A2). |
| Asset purchase | — | **UNKNOWN** | **UNKNOWN** | Builder exists (`buildAssetPurchaseAtFairValue`); no runtime command API. |
| Generic persist | `persistDraft` | **NON_ATOMIC** | depends on `externalId` + source tx | Post-commit: `refreshDerivedCaches` + `AuditService.record` (separate connections). |

---

## Other multi-write surfaces

| Command / path | Files / functions | Atomicity | Idempotency | Notes |
|---|---|---|---|---|
| Transaction metadata update | `TransactionsService.update` | **PARTIAL_RISK** | N/A | Updates `source_transactions` then optionally `financial_events.vehicleId` without txn. Does **not** rebuild postings when `isInternalTransfer` flips — classification revision of economic meaning is incomplete (P0 product gap; R1 must add atomic rebuild path for tests). |
| Transaction split rebuild | — | **UNKNOWN** | N/A | Schema `transaction_splits` + Zod `transactionSplitsSchema`; **no** replace/rebuild write API. Mortgage splits only at create time. |
| Financial event revision (EXPENSE→TRANSFER) | — | **UNKNOWN** / **NON_ATOMIC** if naive | N/A | No dedicated revision service; flag flip alone would leave expense postings active. |
| Reconciliation writes | `LedgerTruthService.refreshDerivedCaches` / `reconcileHousehold` | **PARTIAL_RISK** | **IDEMPOTENT** (snapshot day) | Updates account caches + delete/insert snapshots per account in a loop **without** wrapping household refresh in one txn. Read-only vs ledger postings (does not create events). Job: `RECONCILE_ACCOUNT_BALANCES` — retry-safe for MATCHED snapshot replace. |
| Metric snapshot persist | `MetricRegistryService` | **PARTIAL_RISK** | upsert-style | Derived; ledger remains SoT. Out of R1 economic-command scope. |
| Audit log (financial) | `AuditService.record` via `afterWrite` | **NON_ATOMIC** vs ledger | N/A | Runs **after** persist returns — financial change can commit without audit row. Observability `logger` is non-transactional (OK). |

---

## Jobs that can touch financial state

| Job | Path | Writes financial events? | Retry-safe? |
|---|---|---|---|
| `RECONCILE_ACCOUNT_BALANCES` | `jobs/queue.ts` → `reconcileHousehold` | No (cache/snapshots only) | Yes for same asOf day (delete+insert snapshot). |
| `HEALTH_CHECK` | queue | No | Read-only / noop. |

No V1 job currently creates depreciation or import-derived ledger events in worker path.

---

## DB constraints (pre-R1)

| Constraint | Table | Protects |
|---|---|---|
| `source_tx_household_external` | `source_transactions (household_id, account_id, external_id)` | Per-account source external ids |
| `raw_import_records_household_hash` | import records | Import fingerprint |
| *(none)* | financial events / depreciation keys | Non-cash commands |

---

## Failure modes proven / observed

1. **P0-A1:** `persistBalancedEvent` has no `db.transaction` (static + structural). Mid-insert failure can leave orphan event/entry/postings.
2. **P0-A2:** Same depreciation `externalId` twice → two events, vehicle 300k→280k on two 10k calls (`p0-adversarial-proof.test.ts`).

---

## Target after R1 (this batch)

| Area | Target |
|---|---|
| `persistBalancedEvent` | Single `db.transaction`; optional injected executor |
| All `EconomicEventsService` creates | Share that txn; audit in-txn; cache refresh post-commit |
| Idempotency | `financial_command_idempotency (household_id, command_type, external_id)` UNIQUE + `payload_hash` |
| Depreciation / transfer / CC or mortgage payment | Identical retry → one effect; key+different payload → conflict |
| Split replace + classification revise | New atomic APIs for persistence integrity (minimal) |
| Failure injection tests | Real stack rollback proofs |

Out of R1: mock-extract float, metric inputHash/asOf, accounts-list cache, refund HTTP product surface, vehicle purchase runtime, REVERSED/CORRECTED.
