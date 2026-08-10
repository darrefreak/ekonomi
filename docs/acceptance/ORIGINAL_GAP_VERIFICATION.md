# Original Gap Verification

**Audit date:** 2026-08-07  
**Branch inspected:** `cursor/final-acceptance-audit-9c58` (tip of Workstream O)  
**Method:** Code + runtime API probes; workstream reports treated as claims only.

Statuses: `VERIFIED_FIXED` · `PARTIALLY_FIXED` · `NOT_FIXED` · `REGRESSION` · `NO_LONGER_RELEVANT`

---

## P0 (must be zero unresolved for acceptance)

| ID | Original issue | Status | Evidence |
|---|---|---|---|
| **P0-1** | Ledger balances not source of truth | **PARTIALLY_FIXED** | Seed reconstructs then writes `accounts.currentBalanceMinor` (`demo-household.ts`). NW history can rebuild from postings (`household-metrics.service.ts`). Live position APIs still **sum cache**. `reconcileCachedBalances` / `applyLedgerBalancesToAccounts` not wired to jobs. Worker only runs `HEALTH_CHECK` (`jobs/queue.ts`). No runtime ledger write API. |
| **P0-2** | Dashboard / NW hardcode SEK outcomes | **VERIFIED_FIXED** | `dashboard.service.ts` / `net-worth.service.ts` use `HouseholdMetricsService`. Forecast via engine. Anti-hardcode tests in `dashboard.service.test.ts`. Stale claims remain in old `FALSE_COMPLETENESS.md`. |
| **P0-3** | No role / privacy enforcement | **VERIFIED_FIXED** | `requireCanWrite` / `requireAdmin` + privacy projection (`household-access.service.ts`); applied to accounts/transactions/search; `privacy-security.test.ts` (VIEWER write deny, AGGREGATES_ONLY, foreign household). Residual: invite UI, CHILD UX — not unenforced server roles. |
| **P0-4** | Logout / revoke missing | **VERIFIED_FIXED** | `POST /auth/logout`, `/auth/revoke-all`; web `session.logout()`; covered by authz + E2E. |
| **P0-5** | Security baseline missing | **PARTIALLY_FIXED** | Helmet + Throttler + fail-closed JWT secrets present. Many write bodies Zod-validated; **GET `householdId` often unvalidated**. Broader validation incomplete. |
| **P0-6** | Mobile Mer placeholder | **VERIFIED_FIXED** | `more-page.tsx` real IA; E2E mobile Mer test passes. |
| **P0-7** | Splits / recon / refunds not operational | **PARTIALLY_FIXED** | Engine builders + seed persist refunds/splits/recon groups. **No product API/UI** to create/read splits or recon groups at runtime. |
| **P0-8** | Metric consistency / registry | **PARTIALLY_FIXED** | Shared `HouseholdMetricsService.getFinancialSnapshot` used by dashboard/NW/cashflow/decisions/AI/reports. **No** `MetricDefinition` / versioned registry tables. |

### P0 unresolved count

**4 unresolved** (PARTIALLY_FIXED treated as unresolved for acceptance): **P0-1, P0-5, P0-7, P0-8**.

---

## Additional MASTER_GAP P0 themes

| Theme | Status | Notes |
|---|---|---|
| Internal hardcoded analytics | **VERIFIED_FIXED** | Same as P0-2 for dashboard/NW; opportunities now `live-engine` with some heuristics |
| Echo lint false green | **PARTIALLY_FIXED** | Real ESLint on product packages; mobile/config still echo |
| Cross-household IDOR | **VERIFIED_FIXED** (no exploit found) | Membership gates; foreign household → 404/403 in probe + tests |

---

## P1 themes (sampled)

| Theme | Status | Notes |
|---|---|---|
| Account/transaction mutations | **PARTIALLY_FIXED** | Create/update/archive accounts; patch transactions; not full CRUD taxonomy |
| Wealth pages | **PARTIALLY_FIXED** | Investments/assets/debt APIs + UI exist; valuation depth thin |
| Settings / policies | **PARTIALLY_FIXED** | Persisted; privacy editable |
| Search / notifications / reports / onboarding | **VERIFIED_FIXED** (core) | Delivered in WS M; polish gaps remain |
| Document workflow | **PARTIALLY_FIXED** | Upload/status/extract mock; not full OCR |
| Live decision engines | **PARTIALLY_FIXED** | Detectors live; some heuristic savings constants |
| Jobs catalog | **NOT_FIXED** | Only health job executes |
| Available to invest | **NOT_FIXED** | Spec/docs only |
| Vehicle purchase/depreciation ledger path | **PARTIALLY_FIXED** | Purchase builder unit-tested; depreciation builder missing; seed ASSET/loan diverge from valuation |

---

## P2 themes (sampled)

| Theme | Status | Notes |
|---|---|---|
| Real lint / E2E / a11y | **VERIFIED_FIXED** (product) | WS O |
| Dark mode | **NOT_FIXED** | Tokens only; UI light |
| Lifestyle creep | **PARTIALLY_FIXED** | Engine + opportunities surface |
| Backtesting depth | **PARTIALLY_FIXED** | Infra + lookback; model linear |
| Merchant alias engine | **NOT_FIXED** | Seed merchants only |

---

## P3 themes (sampled)

| Theme | Status | Notes |
|---|---|---|
| Native iOS (`apps/mobile`) | **NOT_FIXED** | Reserved scaffold |
| Push / widgets | **NOT_FIXED** | Out of V1 foundation |
| Advanced portfolio | **NOT_FIXED** | — |

---

## Acceptance implication

**Zero unresolved P0 is NOT met.** Acceptance cannot be `ACCEPTED — V1 PRODUCT COMPLETE`.
