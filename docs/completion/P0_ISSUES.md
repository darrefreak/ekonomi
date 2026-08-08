# P0 Issues — Financial Correctness, Security, Data Integrity

Priority model: **P0 before P1**.  
These must be resolved (or explicitly accepted with risk) before claiming product completeness of downstream analytics.

---

## P0-1 — Ledger balances are not the source of truth

**Status:** BROKEN relative to master invariants  
**Evidence:** Seed writes `ledger_postings` but APIs use `accounts.currentBalanceMinor` and illustrative snapshots. Phase 2 report admits cache not recomputed.

**Impact:** Net worth / cash / debt can diverge from events; transfers/CC/mortgage demos look correct only because seed is handcrafted.

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

**Status:** SCAFFOLD_ONLY / NOT_STARTED  
**Evidence:** Empty `transaction_splits`, unused `reconciliation_groups`, no refund builders despite METRICS rules.

**Impact:** Cannot correctly represent multi-category expenses or refund netting; transfer pairing incomplete.

**Required:** At least: refund builders + metrics netting; transfer dual-leg or reconciliation group usage; category splits persistence path.

---

## P0-8 — Metric consistency / registry absent

**Status:** FIXED (Batch C2)  
**Evidence:** Code-first `METRIC_DEFINITIONS` + `METRIC_BUNDLE_VERSION` in `@ffos/financial-engine`; `metric_definitions` / `metric_snapshots` tables; `MetricRegistryService`; dashboard/net-worth/debt/wealth/reports/AI consume shared snapshot + `metricMeta`; consistency test on demo household. See `docs/completion/batches/C2_REPORT.md`.

**Impact:** Mitigated — same `(householdId, asOf)` yields identical core position/debt/investment totals across surfaces with version + inputHash.

**Required:** Shared metric calculation path with `asOf` + version; all surfaces consume it.

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
