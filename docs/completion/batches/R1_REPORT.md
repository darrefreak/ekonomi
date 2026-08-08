# Batch R1 — Atomic Ledger Persistence + Idempotency

**Status:** COMPLETE (batch scope)  
**Branch:** `cursor/batch-r1-atomic-idempotency-9c58`  
**PR:** https://github.com/darrefreak/ekonomi/pull/35  
**Base:** `cursor/p0-financial-acceptance-gate-9c58`  
**Date:** 2026-08-08  

**Does not claim P0 financial core accepted.**

---

## Atomicity issues found

See `R1_CURRENT_ATOMICITY_AUDIT.md` (pre-fix baseline).

| Issue | Severity |
|---|---|
| `persistBalancedEvent` multi-write without `db.transaction` | P0-A1 |
| Depreciation `externalId` skipped source-tx idempotency → double write-down | P0-A2 |
| Audit + cache refresh after persist (audit could miss) | Integrity |
| No atomic split replace / classification rebuild APIs | Integrity |
| CC/mortgage payments lacked durable command keys | Retry risk |

---

## Transaction boundaries added

| Path | Boundary |
|---|---|
| `persistBalancedEvent` | Single `getDb().transaction` (or caller-provided `executor`) covering event, entry, postings, recon group, source txs, links, splits, idempotency row, financial audit row |
| `replaceEventSplits` | One txn: validate → delete splits → insert → audit |
| `reviseEventEconomicMeaning` | One txn: delete old postings/entry → update event → insert entry/postings → update source flags → audit |
| `TransactionsService.update` | One txn when patching source tx + event vehicleId |
| `refreshDerivedCaches` | Remains **post-commit** (derived cache; ledger is SoT) |

On any failure inside the financial txn: full ROLLBACK — no partial economic state.

---

## Repositories / modules changed

| File | Change |
|---|---|
| `apps/api/src/db/client.ts` | `DbExecutor` type for shared txn context |
| `apps/api/src/db/seed/persist-event.ts` | Transactional persist + idempotency + replace/revise helpers |
| `apps/api/src/db/schema-economic.ts` | `financialCommandIdempotency` table |
| `apps/api/src/ledger/economic-events.service.ts` | Command types, externalIds, error mapping, split/revise APIs |
| `apps/api/src/transactions/transactions.service.ts` | Dual-write in one txn |
| `apps/api/src/common/validation-exception.filter.ts` | Conflict code mapping |
| `apps/api/drizzle/0020_batch_r1_command_idempotency.sql` | Migration |

---

## Idempotency design

Key: `(household_id, command_type, external_id)` UNIQUE  
Payload: SHA-256 of canonical economic fields (event type, amounts, postings, splits, accounts, dates).

| Retry | Behavior |
|---|---|
| Same key + same payload | Return existing `financial_event` (no second effect) |
| Same key + different payload | `IDEMPOTENCY_CONFLICT` (409) |
| Concurrent same key | Unique constraint + txn rollback → one winner; losers resolve to existing |

Commands with durable keys: `INTERNAL_TRANSFER`, `ASSET_DEPRECIATION`, `CREDIT_CARD_PAYMENT` (default externalId), optional on purchase/mortgage/invest/refund.

---

## DB constraints

- `financial_command_idempotency_key` UNIQUE on `(household_id, command_type, external_id)`
- Existing `source_tx_household_external` retained
- Migration is additive; no seed duplicate conflict

---

## Concurrency behavior

`R1-T4` runs three parallel `createAssetDepreciation` with the same `externalId`. Result: one event, one write-down (300k→290k for 10k).

---

## Failure-injection tests

| ID | Case | Result |
|---|---|---|
| R1-T1 | Fail before final posting on transfer | No event/entry/postings/links; balances unchanged |
| R1-T2 | Depreciation retry same key | One event, 300k→280k |
| R1-T3 | Same key different amount | 409 conflict; no extra effect |
| R1-T4 | Concurrent duplicates | One economic effect |
| R1-T5 | Invalid / mid-replace splits | Original mortgage splits preserved |
| R1-T6 | Mid-revise failure EXPENSE→TRANSFER | Old expense postings + amounts intact; success path atomic |

---

## Post-commit / outbox

- Derived cache refresh runs **after** commit only.
- No V1 outbox for external publish; fake connectors only. Documented limitation: if future jobs must notify externals, enqueue then after commit (or transactional outbox).
- Reconcile job: cache/snapshots only; retry-safe for same asOf day; does not create ledger events.

---

## Source-of-truth

Ledger postings remain authoritative. Cache/snapshot refresh failures do not roll back committed financial commands; reconcile/recompute recovers derived state.

---

## Remaining P0 blockers (not fixed in R1)

| ID | Item |
|---|---|
| P0-A3 | Document mock-extract float money |
| P0-A4 | Refund HTTP + general split product API/UI |
| P0-A5 | Accounts list / debt detail cache; NW history refresh |
| P0-A6 | Metric inputHash / asOf / historical version serve |
| P0-A7 | Vehicle purchase / financed purchase runtime |
| P0-A8 | REVERSED / CORRECTED operational semantics |

---

## Gates

| Gate | Result |
|---|---|
| Atomic ledger persistence | **PASS** |
| Depreciation idempotency | **PASS** |
| Concurrent duplicate protection | **PASS** |
| Failure rollback | **PASS** |
| Split rebuild atomicity | **PASS** |
| Classification revision atomicity | **PASS** |
| A2/A3/S1 regressions | **PASS** |
| Build | **PASS** |
| Lint | **PASS** |
| Typecheck | **PASS** |
| Tests (66) | **PASS** |
| Docker (ekonomi stack) | **healthy** |

**FINANCIAL CORE ACCEPTED: NO** — wait for further remediation batches.
