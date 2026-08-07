# P0 Issues — Financial Correctness, Security, Data Integrity

Priority model: **P0 before P1**.  
These must be resolved (or explicitly accepted with risk) before claiming product completeness of downstream analytics.

> **Adversarial P0 financial acceptance (2026-08-07): FAIL — FINANCIAL CORE NOT ACCEPTED.**  
> See `docs/acceptance/p0/P0_FINANCIAL_ACCEPTANCE.md` and `P0_REMAINING_FIXES.md`.  
> **P0 REMAINING: > 0** · **FINANCIAL CORE ACCEPTED: NO**

---

## P0-1 — Ledger balances are not the source of truth

**Status:** PARTIAL (A2 progress; residuals remain)  
**Evidence:** Metrics/dashboard/NW reconstruct from postings; reconcile job/API no silent overwrite. Residuals: accounts list + debt detail still cache-first; NW history snapshots not refreshed after mutations. See `docs/acceptance/p0/P0_REVERIFICATION.md`.

**Impact:** Core analytics usually ledger-aligned; some list/detail/history paths can diverge.

**Required:** Reconstruct balances from postings (or maintain postings + verified cache with reconciliation job); snapshot `ledgerCalculatedBalance` for real.

---

## P0-2 — Dashboard / net-worth assemblies hardcode financial outcomes

**Status:** MOCK_ONLY internal logic  
**Evidence:** `dashboard.service.ts`, `net-worth.service.ts`, fixed mortgage “9 800 kr”.

**Impact:** Users see precise SEK figures that are not derived from household data.

**Required:** Derive NW change, forecast horizons, upcoming obligations from events/recurring/contracts; remove hardcoded minors from product paths.

---

## P0-3 — No role or privacy enforcement

**Status:** ADDRESSED (Workstream N)  
**Evidence:** `requireCanWrite` / `requireAdmin`; account/transaction privacy projection; authz tests in `privacy-security.test.ts`.

**Impact:** Mitigated for accounts/transactions/search and write paths covered in N. Remaining: invite/manage UI, CHILD-specific UX limits.

**Required:** Server-side role checks + aggregate-only query paths; authorization tests.

---

## P0-4 — Auth lifecycle incomplete (logout / revoke)

**Status:** ADDRESSED (Workstream N)  
**Evidence:** `POST /api/v1/auth/logout`, `POST /api/v1/auth/revoke-all`; web `logout()` revokes then clears localStorage.

**Impact:** Refresh tokens can be invalidated; access JWT still expires naturally (short TTL).

**Required:** Logout + refresh token revocation; client clear + optional revoke-all.

---

## P0-5 — Security baseline / validation breadth

**Status:** FIXED (Workstream N baseline + Batch S1 validation breadth)  
**Evidence:** Helmet + Throttler + fail-closed secrets (N); S1 Zod on all V1 write/query boundaries; strict financial bodies; job payload validation; depreciation domain guard; consistent `VALIDATION_ERROR` envelope; `docs/completion/batches/S1_VALIDATION_AUDIT.md`.

**Impact:** Malformed / mass-assigned / economically invalid writes are rejected before persistence. Authz remains independent of validation.

**Required:** Throttling on auth, security headers, broaden Zod validation, fail closed without secrets in non-dev.

---

## P0-6 — Mobile “Mer” placeholder breaks primary navigation

**Status:** ADDRESSED  
**Evidence:** `MorePage` at `apps/web/src/components/layout/more-page.tsx` lists desktop IA links; E2E mobile project covers `/more`.

**Impact:** Secondary areas reachable on ~375px via Mer.

**Required:** Working More menu linking to desktop IA (or equivalent IA).

---

## P0-7 — Transaction splits / reconciliation / refunds not operational

**Status:** PARTIAL (runtime builders/APIs for transfer/CC/mortgage/invest; product gaps remain)  
**Evidence:** Mortgage splits + recon groups persist; refund service+test exist but **no HTTP refund**; no general category-split write API; persist not transactional. Acceptance audit: PARTIAL. See `P0_REMAINING_FIXES.md` P0-A4/A1.

**Impact:** Core economic events work; multi-category split product path and refund API incomplete; corruption risk on partial writes.

**Required:** At least: refund HTTP + metrics netting; transfer dual-leg or reconciliation group usage; category splits persistence path; DB transaction around multi-write.

---

## P0-8 — Metric consistency / registry absent

**Status:** PARTIAL (Batch C2 foundation; integrity gaps)  
**Evidence:** Registry + shared consumers + demo consistency test. Gaps: weak `inputHash`, hardcoded asOf, yearly fake meta, no historical version serve, NW history stale risk. Acceptance audit: PARTIAL. See `METRIC_REGISTRY_VERIFICATION.md`.

**Impact:** Core totals agree across main surfaces for demo asOf; reproducibility/versioning claims not fully met.

**Required:** Shared metric calculation path with `asOf` + version; all surfaces consume it; meaningful inputHash; coherent asOf.

---

## P0 count

| ID | Title | Severity |
|---|---|---|
| P0-1 | Ledger≠balances | Critical |
| P0-2 | Hardcoded dashboard/NW | Critical |
| P0-3 | Privacy/roles unenforced | Critical |
| P0-4 | Token revoke/logout | High |
| P0-5 | Rate limit / headers / validation | High |
| P0-6 | Mobile Mer broken | High (UX) |
| P0-7 | Splits/recon/refunds | High (domain) |
| P0-8 | Metric consistency | High |

**Total P0 tracked: 8**

Related P1 themes (not expanded here): read-only mutations, wealth placeholders, settings/policies, search, onboarding, jobs catalog, document workflow, live decision engines — see FEATURE_MATRIX.md.
