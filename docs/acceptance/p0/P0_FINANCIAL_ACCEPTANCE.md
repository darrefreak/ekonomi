# P0 Financial Acceptance

**Date:** 2026-08-07  
**Auditor:** adversarial acceptance gate (code + tests + proofs)  
**Base tip:** post-C2 (`cursor/batch-c2-metric-registry-9c58`)

---

## FAIL — P0 FINANCIAL CORE NOT ACCEPTED

Batch reports A2/A3/S1/C2 are **substantially real** and many invariants pass as persisted tests.  
Acceptance criteria require **zero** unresolved P0 and **zero** known unsafe money paths in V1 flows. That bar is **not** met.

---

## Scorecard

| Dimension | Result |
|---|---|
| P0 remaining | **> 0** |
| Financial correctness | **FAIL** |
| Money exactness | **FAIL** (core writes OK; document extract float path remains) |
| Ledger truth | **PARTIAL → FAIL** for acceptance (list/detail/history residuals) |
| Persisted invariants (A2 transfer/CC/mortgage/invest/recon) | **PASS** |
| Validation (S1) | **PASS** |
| Reconciliation (no silent overwrite) | **PASS** |
| Depreciation economics | **PASS** |
| Depreciation idempotency | **FAIL** |
| Atomic multi-write | **FAIL** |
| Metric Registry completeness | **FAIL** (PARTIAL implementation) |
| Metric consistency (core totals) | **PASS** on demo |
| Financial household isolation | **PASS** (authz + household-scoped account lookup; privacy tests green) |
| Build / Lint / Typecheck / Tests / Docker | **PASS** |

---

## Scenario matrix (adversarial)

| # | Scenario | Result | Notes |
|---|---|---|---|
| 3–4 | Exact money roundtrip (forms/ledger) | PASS | bigint string path |
| 3 | Document mock extract money | FAIL | `Number * 100` float |
| 5 | Internal transfer | PASS | A2 persisted |
| 6 | Credit card purchase+payment | PASS | spending once |
| 7 | Mortgage split | PASS | interest expense / principal debtReduction |
| 8 | Investment transfer | PASS | NW unchanged |
| 9 | Cash vehicle purchase runtime | FAIL / PARTIAL | seed opening only; no purchase API |
| 10 | Financed vehicle purchase | FAIL | missing ledger path |
| 11 | Depreciation 300→280 | PASS economics | FAIL idempotency |
| 12 | Loan principal/interest (mortgage) | PASS | financed vehicle loan payments not full product path |
| 13 | Refund | PARTIAL | service+test; no HTTP |
| 14 | Reversal/correction | FAIL | enum only |
| 15 | Split atomicity | FAIL | no `db.transaction`; no general split API |
| 16 | Reconciliation mismatch | PASS | A2 Test 5 |
| 17 | Idempotency | PARTIAL | transfer OK; depreciation NOT |
| 18 | Cross-household writes | PASS | requireCanWrite + household account filter |
| 19 | Validation adversarial | PASS | S1 suite |
| 20–24 | Metric registry depth | FAIL | see METRIC_REGISTRY_VERIFICATION.md |
| 25–26 | Cache / snapshot invalidation | PARTIAL | live metrics OK; NW history stale risk |
| 27 | Demo seed reconcile | PASS | 0 mismatches |
| 28 | Hardcoded analytics | PASS | no 9800 tip |
| 29 | AI tool consistency | PASS | uses snapshot |
| 30 | Persisted test quality | PASS for A2/A3 core | |
| 31–34 | Clean gates | PASS | build/lint/typecheck/test/docker |

---

## Remaining P0 identifiers

See `P0_REMAINING_FIXES.md`:

- **P0-A1** — Multi-write ledger persist lacks DB transactions  
- **P0-A2** — Depreciation not idempotent (double write-down)  
- **P0-A3** — Document mock-extract float kronor→öre  
- **P0-A4** — P0-7 product gaps (refund HTTP, general splits API/UI)  
- **P0-A5** — P0-1 residuals (accounts list / debt detail / NW history stale)  
- **P0-A6** — Metric registry integrity (weak inputHash, asOf hardcoding, no historical serve)  
- **P0-A7** — Vehicle purchase / financed purchase runtime paths missing  
- **P0-A8** — Reversal/correction statuses non-operational  

---

## Technical gates (this run)

| Gate | Result |
|---|---|
| `pnpm build` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS (api 56) |
| Adversarial proofs | PASS (document known breakage) |
| Docker `/health/ready` | PASS |
| Demo reconcile | 0 mismatches |

---

## Decision rule applied

Do **not** downgrade financial correctness / atomicity / unsafe money / incomplete P0-7/P0-8 to P1 to force PASS.

**FINANCIAL CORE ACCEPTED: NO**
