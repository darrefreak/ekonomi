# P1-U1 Audit — Core User Workflows & CRUD

**Date:** 2026-08-08  
**Branch:** `cursor/p1-u1-core-workflows-9c58`  
**Base:** `cursor/batch-r4-metric-registry-9c58` (P0 financial core accepted)  
**Sources:** live routes/controllers/UI (not stale gap docs alone)

---

## Authoritative constraints

- P0 remaining: **0** · FINANCIAL CORE ACCEPTED: **YES**
- Do not rewrite ledger architecture, bypass Metric Registry, reintroduce float money, or treat cache as financial truth.

---

## Dead / incomplete product UI (pre-fix)

| Feature | UI | API | Persist | Validation | Financial integration | Refresh persist | Status | Fix required |
|---|---|---|---|---|---|---|---|---|
| Accounts list/detail | Y | Y | Y | Y | Y (ledger-aligned) | Y | PARTIAL | Full create fields; ownership; archived toggle |
| Account create opening balance | N (hardcoded 0) | Y | Y (no income event) | Y | Y | N/A | PARTIAL | UI opening balance + liability semantics tests |
| Account edit (name/provider/shared/credit) | Partial | Y | Y | Y | n/a | Partial | PARTIAL | Complete detail form |
| Account archive | Y | Y | Y | Y | n/a | Y | OK | Keep soft-archive |
| Transactions browse/filter | Y | Y | Y | Y | Y | Y | PARTIAL | Ensure filters + mobile |
| Transaction metadata edit | Y | Y | Y | Y | Partial (metadata) | Local only | PARTIAL | Merchant; invalidate queries |
| Manual expense/income create | N | Expense service-only; income engine-only | N HTTP | N | N | N | **GAP** | HTTP + domain forms |
| Internal transfer create | N | Y | Y | Y | Y | N | **GAP** | Transfer UX |
| Classification revise | Review flag only | revise EXPENSE→TRANSFER | Partial | Y | Partial | N | **GAP** | Progressive classify UX |
| Category splits / mortgage split UX | N | Y (`replaceEventSplits`) | Y | Y | Y | N | **GAP** | Split editor UI |
| Categories CRUD | Picker only | List only | Seed only | N | n/a | N | **GAP** | CRUD + archive |
| Merchant assign | Display only | PATCH merchantId | Y | Y | n/a | N | **GAP** | List merchants + assign; no broken editor |
| Goals create/contribute | Y | Y | Y | Y | n/a | Y | PARTIAL | Edit/status via updateGoal |
| Goals edit | N | Y unused | Y | Y | n/a | N | **GAP** | Edit form |
| Household rename | Y (settings) | Y | Y | Y | n/a | Y | OK | Keep |
| Member list | Y (settings) | GET settings | Y | Y | n/a | Y | PARTIAL | Roles display OK |
| Member invite/role/remove | N | **Missing** | N | N | n/a | N | **GAP** | Invite token + role/remove + last OWNER |
| Member privacy policy | Y | Y | Y | Y | Y (projection) | Y | OK | Human-readable labels |
| Settings sections | Thin | Partial | Partial | Y | Policies Y | Partial | PARTIAL | Real sections; categories; members; policies expand |
| Financial policies (min cash/EF/safety) | Y | Y | Y | Y | Later U2 | Y | PARTIAL | Add savings-rate / fixed-cost / invest target |
| TanStack Query invalidation | N | n/a | n/a | n/a | Critical | N | **GAP** | Add QueryClient + keys |
| Cross-household authz | n/a | Tests exist (privacy) | Y | Y | Y | n/a | PARTIAL | Extend for new mutations |

---

## Update API disposition (meaningful endpoints)

| Endpoint | Disposition |
|---|---|
| PATCH accounts | **A** — expose full edit UX |
| PATCH transactions | **A** — classification/merchant/notes/tags/exclude |
| PATCH goals / sinking funds | **A** — edit UX |
| PATCH settings | **A** — household/policies/privacy |
| POST ledger transfers/refunds/splits/revise | **A** — product forms in U1 |
| POST ledger CC/mortgage/invest/purchase/depr | **B** — specialized; debt/vehicle surfaces own later; not fake buttons in U1 |
| GET ledger balances / reconcile | **B** — internal/ops; account detail shows recon status |
| Privacy delete/leave request | **B** — request scaffold (fulfillment async); keep as request UX |

---

## Archive vs delete (U1 policy)

| Entity | Behavior |
|---|---|
| Account | Soft `archivedAt`; no hard delete of history |
| Category | Soft `archivedAt`; system categories protected; historical tx keep FK |
| Goal | Status `CANCELLED` / `COMPLETED` (no hard delete) |
| Member | Remove membership row only if not last OWNER |
| Invitation | Cancel pending invite |

---

## Implementation plan (this batch)

1. Migration: category archive, policy fields, invitations  
2. Backend: categories CRUD, members invite/role/remove, cash income/expense HTTP, merchants list, account ownership, audits  
3. Frontend: QueryClient, accounts/txns/goals/settings/categories/transfer/split workflows  
4. Tests: opening-balance semantics, authz, API E2E flows, P0 regression suite  
5. Docs: `P1_U1_REPORT.md` + FEATURE_MATRIX updates  

---

## Intentionally deferred to U2+

- Dark mode application (appearance save remains; theme apply = P2)  
- Merchant alias intelligence engine  
- Full revise matrix (all economic type flips) beyond expense→transfer + domain creates  
- Vehicle purchase UX (API exists; vehicle workstream)  
- Available-to-invest product surface (policies feed later)  
- Client auto refresh-on-401 (P1 residual, not U1 CRUD blocker if session works)
