# P0 Reverification — Adversarial Audit

**Date:** 2026-08-07  
**Branch audited:** `cursor/batch-c2-metric-registry-9c58` tip (via `cursor/p0-financial-acceptance-gate-9c58`)  
**Method:** Code inspection + persisted invariant tests + adversarial proofs. Completion reports not trusted without verification.

Classification: `VERIFIED_FIXED` | `PARTIAL` | `NOT_FIXED` | `REGRESSION`

---

## Original acceptance P0s

| ID | Title | Classification | Evidence |
|---|---|---|---|
| **P0-1** | Ledger/cache source of truth | **PARTIAL** | Metrics/dashboard/NW use `getLedgerAlignedAccountRows` + reconstruct. Reconcile job/API exists and does not silent-overwrite reported. **Residuals:** accounts **list** still surfaces `currentBalanceMinor` cache (`accounts.service.ts` list mapper); debt **detail** / mortgage context read cache without ledger align; NW history snapshots insert-if-missing and are never refreshed after later postings. |
| **P0-5** | Validation breadth | **VERIFIED_FIXED** | S1 Zod on V1 write/query boundaries; strict bodies; job payload schema; depreciation domain guard; `VALIDATION_ERROR` envelope; negative tests green (`runtime-validation.test.ts`, schemas). |
| **P0-7** | Splits / recon / refunds product path | **PARTIAL** | Runtime: transfer dual-leg + recon groups; mortgage splits persist; refund **service + persisted test** exist. **Missing for product acceptance:** no HTTP refund route; no general category-split write/read API; `transactionSplitsSchema` not wired into persist; UI/api-client ledger writes absent. Docs (`P0_ISSUES.md` SCAFFOLD_ONLY) are stale but the product gap remains. |
| **P0-8** | Metric Registry | **PARTIAL** | Real catalog, tables, rematerializing snapshots, cross-surface totals agree on demo (C2 test). **Residuals:** weak `inputHash` (aggregate-only); `metricMeta.calculationVersion` = bundle not per-metric; yearly report fake hash; no historical formula serving; most product APIs hardcode `DEMO_AS_OF_DATE`; NW history can stay stale. |

---

## Additional financial blockers (from prior audits)

| Item | Classification | Evidence |
|---|---|---|
| Float money input on core write paths | **VERIFIED_FIXED** | `kronorStringToMinor` bigint path; Zod `amountMinorStringSchema`; web `money-input.ts` wrapper. |
| Float money residual (documents) | **NOT_FIXED** | `apps/api/src/intake/mock-extract.ts:41` — `BigInt(Math.round(Number(raw) * 100))` persists to `documents.amountMinor`. |
| Vehicle depreciation runtime | **VERIFIED_FIXED** | Builder + API + seed + A3 persisted test; excess write-down rejected. |
| Depreciation idempotency | **NOT_FIXED** | Adversarial proof: same `externalId` creates **two** events (no `source_transactions` row for non-cash depr). Balance 300k→280k on two 10k retries. See `p0-adversarial-proof.test.ts`. |
| Persisted A2 invariants | **VERIFIED_FIXED** | `ledger-invariants.test.ts` inserts DB + reconstructs (transfer/CC/mortgage/invest/recon/refund). |
| Multi-write atomicity | **NOT_FIXED** | Zero `db.transaction` in API; `persistBalancedEvent` sequential inserts — partial write possible. |
| Cash vehicle purchase runtime | **PARTIAL** | Engine `buildAssetPurchaseAtFairValue` unit-only; seed uses ASSET opening, not purchase event. |
| Financed vehicle purchase ledger | **NOT_FIXED** | No financed-purchase builder/API; seed LOAN opening + metadata only. |
| Reversal / correction statuses | **NOT_FIXED** | Enum exists on `source_transactions`; no reverse postings; reconstruct ignores status. |
| Hardcoded dashboard/NW (P0-2) | **VERIFIED_FIXED** | No 9 800 kr tip; snapshot-driven; guarded by dashboard test. |

---

## Acceptance requirement

P0 acceptance requires **every** item above that is in the original P0 set to be `VERIFIED_FIXED`.

**Result (audit date):** unmet — P0-1, P0-7, P0-8 remain `PARTIAL`; several financial blockers `NOT_FIXED`.

---

## R4 update (2026-08-08)

Remediation batches R1–R4 closed the residual P0 identifiers. Reclassification:

| ID | Classification after R1–R4 |
|---|---|
| P0-1 / P0-A5 | **VERIFIED_FIXED** (R2) |
| P0-7 / P0-A4 | **VERIFIED_FIXED** (R3) |
| P0-8 / P0-A6 | **VERIFIED_FIXED** (R4) |
| Atomicity / depreciation idempotency | **VERIFIED_FIXED** (R1) |
| Document float extract | **VERIFIED_FIXED** (R2) |
| Purchase / financed / reverse | **VERIFIED_FIXED** (R3) |

**Result after R4:** met — see `P0_FINANCIAL_ACCEPTANCE.md`.
