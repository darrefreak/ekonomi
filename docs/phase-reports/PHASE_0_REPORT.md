# Phase 0 Report — Architecture

**Date:** 2026-08-07  
**Status:** COMPLETE — STOPPED (awaiting `START PHASE 1`)  
**Branch:** `cursor/phase-0-architecture-9c58`

## 1. Completed items

### Core documentation

| Document | Path |
|---|---|
| Product spec | `docs/PRODUCT_SPEC.md` |
| Domain invariants | `docs/DOMAIN_INVARIANTS.md` |
| Architecture | `docs/ARCHITECTURE.md` |
| Data model | `docs/DATA_MODEL.md` |
| Metrics | `docs/METRICS.md` |
| UI | `docs/UI.md` |
| Security | `docs/SECURITY.md` |
| Threat model | `docs/THREAT_MODEL.md` |
| Compliance | `docs/COMPLIANCE.md` |
| Privacy model | `docs/PRIVACY_MODEL.md` |
| Data retention | `docs/DATA_RETENTION.md` |
| Roadmap | `docs/ROADMAP.md` |
| Phase 1 plan | `docs/phases/PHASE_1.md` |

### ADRs

| ADR | Topic |
|---|---|
| 0001 | Money representation |
| 0002 | Ledger architecture |
| 0003 | Authentication |
| 0004 | Data source architecture |
| 0005 | Jobs |
| 0006 | Derived metrics |
| 0007 | Household privacy |
| 0008 | Raw source retention |

### Repo bootstrap (docs-only)

- `README.md`
- `.gitignore`
- Directory placeholders under `docs/`

**No application code, Docker services, or migrations were implemented** (correct for Phase 0).

## 2. Architecture decisions (summary)

1. **Pipeline:** External → Raw → Normalize → FinancialEvent → Ledger → Domain → Metrics → Engines → AI → UI.  
2. **Money:** `bigint` minor units + currency; API string serialization; no JS float.  
3. **Ledger:** Event-centric balanced postings; transfers/principal/investment transfers are not consumption.  
4. **Packages:** `financial-engine` pure; no React/Nest/DB.  
5. **Auth:** Access/refresh tokens; client-agnostic.  
6. **Sources:** `FinancialDataSource` abstraction; V1 mocks only.  
7. **Privacy:** Roles + access policies; aggregate contribution without detail leakage.  
8. **Metrics:** Versioned registry with coverage/freshness/assumptions.  
9. **Jobs:** BullMQ, idempotent, household-scoped.  
10. **Compliance:** Observe/analyze/explain/simulate/policy-based recommend only in V1.

## 3. Verification — domain invariants consistency

Cross-check between PRODUCT_SPEC, DOMAIN_INVARIANTS, DATA_MODEL, METRICS, ADRs:

| Invariant | Consistent across docs? |
|---|---|
| Money = bigint minor + currency | ✅ |
| No float for money | ✅ |
| Household-scoped queries | ✅ |
| Derived metrics metadata | ✅ |
| Engine isolation from React/Nest/DB | ✅ |
| AI never sole source of numbers | ✅ |
| Raw retention separate from normalized | ✅ |
| Quality dimensions separated | ✅ |
| Asking ≠ verified sale price | ✅ |

**Result:** Consistent. No contradictory rules found.

## 4. Verification — ledger examples

Modeled postings (conceptual; implementation in Phase 2):

### Internal transfer 20 000 SEK (SEB → SBAB)

| Account | Debit | Credit |
|---|---|---|
| SBAB cash | 20 000 | |
| SEB cash | | 20 000 |

Expense: 0. Net worth: unchanged. ✅

### Investment transfer 20 000 SEK (SEB → Avanza)

| Account | Debit | Credit |
|---|---|---|
| Avanza investment asset | 20 000 | |
| SEB cash | | 20 000 |

Expense: 0. NW unchanged pre fees/market. ✅

### Credit card purchase 2 000 SEK

| Account | Debit | Credit |
|---|---|---|
| Expense (P&L) | 2 000 | |
| CC liability | | 2 000 |

Expense 2 000; liability +2 000. ✅

### Credit card payment 2 000 SEK

| Account | Debit | Credit |
|---|---|---|
| CC liability | 2 000 | |
| Bank cash | | 2 000 |

New expense: 0. ✅

### Mortgage payment 18 000 (10k principal + 8k interest)

| Account | Debit | Credit |
|---|---|---|
| Mortgage liability | 10 000 | |
| Interest expense | 8 000 | |
| Cash | | 18 000 |

Expense 8 000; debt −10 000; NW −8 000 ceteris paribus. ✅

### Vehicle cash purchase 300 000 @ fair value

Cash → Vehicle asset; expense 0; NW unchanged. ✅

### Vehicle depreciation 300k → 280k

Economic cost 20k; cashflow 0; NW −20k. ✅

**Result:** Ledger model can represent all required examples without double-counting.

## 5. Verification — money representation

- Storage: `amountMinor: bigint`, `currency`  
- Transport: string minor units  
- Formatting/rounding/FX centralized  
- Engine tests planned for Phase 2 (money + ledger scenarios)

**Result:** ✅ Specified and ADR-accepted.

## 6. Verification — data source abstraction

- Domains / protocols / auth methods separated  
- Connection health + freshness  
- Future connectors as metadata stubs  
- No V1 real import logic  
- Browser connector safety rules documented  

**Result:** ✅ Extension points clear; anti-patterns forbidden.

## 7. Verification — household privacy model

- Roles ≠ sufficient alone  
- Policies: FULL_DETAILS, AGGREGATES_ONLY, BALANCE_ONLY, OWNER_ONLY, CUSTOM  
- Aggregate contribution without merchant/tx exposure  
- Leave/revoke/separate/historical report designed  
- API projection enforces (not UI-only)  

**Result:** ✅

## 8. Verification — phase boundaries

| Phase | Boundary clear? |
|---|---|
| 0 docs only | ✅ (this report) |
| 1 foundation / shell | ✅ `PHASE_1.md` |
| 2 ledger + seed | ✅ deferred |
| 4B/5B vehicles | ✅ deferred |
| 7 AI | ✅ deferred |
| Hard gate: no auto-advance | ✅ documented in ROADMAP |

**Result:** ✅ Phase 1 will not include full ledger/demo seed/vehicles/AI.

## 9. Migrations / tests / build / Docker / UX

| Check | Status |
|---|---|
| Migrations | N/A — no code yet |
| Tests | N/A — no code yet |
| Build / lint / typecheck | N/A — no code yet |
| Docker | N/A — compose not created yet (Phase 1) |
| Mobile/desktop UX | Spec only (`docs/UI.md`) |

## 10. Known limitations

- Inga körbara appar ännu.
- Decimal library choice (räntor/FX) specificeras vid Phase 1/2 implementation (kravet är “säker decimal”, inte biblioteksnamn).
- Exact JWT vs opaque token choice deferred to Phase 1 implementation detail within ADR-0003.
- Full Swedish copy strings for every screen deferred to UI implementation phases.

## 11. Intentionally deferred

All implementation work, including monorepo scaffolding, Docker, NestJS, Next.js, seeds, ledger engine code, vehicle engine, AI.

## 12. Suggested next phase work

Await explicit: **`START PHASE 1`**

Then execute `docs/phases/PHASE_1.md`: monorepo + Docker + Nest/Next shells + auth/households + dashboard placeholder via API + health/logging + phase 1 report — then STOP.

## 13. STOP

Phase 0 is complete. **Phase 1 has not been started.**
