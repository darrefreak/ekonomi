# P1-U3 Audit — Product polish candidates (post-U2)

**Date:** 2026-08-08  
**Branch:** `cursor/p1-u3-product-polish-9c58`  
**Base:** `cursor/p1-u2-product-completion-9c58`  
**Sources:** U2 deferrals, `FEATURE_MATRIX.md`, `REMAINING_WORK.md`, code paths below  

P0 financial core stays protected. U3 is one completable polish batch — not infinite scope.

---

## Verdict — recommended U3 batch

| Own in U3 | Skip / defer |
|---|---|
| Vehicle purchase UX (cash + financed forms) | Data-driven opportunity model rewrite |
| Seed financed/cash narrative alignment | Broader jobs catalog beyond reconcile |
| Dark theme application | Full merchant alias / import normalizer |
| Merchant list `q` + searchable assign | Audit log UI, recurring engine, leasing depth |
| Scoped E2E (budget edit, review resolve, vehicles) | Broad vehicle market / documents / integrations polish |

**Stop line:** ship the five OWN items + gates; do not open opportunity math or job invention.

---

## U2 deferred candidates

### 1. Vehicle purchase UX + seed financed/cash narrative

| Layer | Status | Paths |
|---|---|---|
| **BE** | **COMPLETE** (runtime) | Engine: `packages/financial-engine/src/ledger/postings.ts` (`buildAssetPurchaseAtFairValue`, `buildFinancedAssetPurchase`); API: `apps/api/src/ledger/economic-events.service.ts`, `ledger.controller.ts` (`POST …/assets/purchase`, `…/assets/financed-purchase`); schemas: `packages/schemas/src/ledger.ts`; tests: `r3-financial-runtime.test.ts`, engine ledger tests |
| **FE** | **MISSING** | No web forms under `apps/web/src/components/vehicles/` or money flows. api-client has cash `createAssetPurchase` only (`packages/api-client/src/client.ts`); **no** `createFinancedAssetPurchase` client method |
| **Seed** | **INCOHERENT** | Cash purchase event 300k @ 2024-06 in `demo-household.ts` with `vehicleId: undefined`; then `seed-vehicles.ts` marks ownership `FINANCED`, `purchasePriceMinor: 389_000_00n` @ 2022-04, loan opening 195k **without** financed purchase event. UI shows financed story; ledger tells cash-purchase story |

**Decision: YES OWN in U3**

Tight scope:
- Align seed to **one** narrative: prefer **financed** (matches ownership/finance UI) via `buildFinancedAssetPurchase` + loan opening 0 / remaining from postings; OR flip ownership to cash/`OWNED` and drop loan — pick financed (demo already shows finance card).
- Link purchase event `vehicleId`.
- Align purchase price / dates / down payment with vehicle metadata.
- FE: vehicle-scoped purchase form (cash | financed) wiring api-client; add financed client method + schema parse.
- Skip: leasing product, market listings rewrite, depreciation UX beyond existing seed write-down.

**Product-blocking?** Yes for demo credibility on Vehicles (P1 PARTIAL ownership/financing).

---

### 2. Dark theme application

| Layer | Status | Paths |
|---|---|---|
| **BE** | **COMPLETE** (persist) | `apps/api/src/settings/settings.service.ts`; schema `packages/schemas/src/settings.ts`; DB `schema-ops.ts` `appearance` |
| **FE save** | **COMPLETE** | Settings select in `apps/web/src/components/settings/settings-page.tsx` |
| **FE apply** | **MISSING** | Tokens `.dark` in `packages/design-tokens/src/tokens.css`; `globals.css` uses CSS vars but **nothing** toggles `html`/`documentElement` `.dark` or `prefers-color-scheme` bridge. No theme provider in `app/layout.tsx` |

**Decision: YES OWN in U3**

Tight scope: small ThemeApplicator (settings appearance + system); apply class on `<html>`; react to settings mutation. Smoke that surfaces/text flip. Skip: redesign tokens, per-component dark overrides, mobile native theme.

Matrix: `Appearance / dark mode` = SCAFFOLD_ONLY (P2) — still cheap polish with visible product value.

---

### 3. Merchant alias / normalization

| Layer | Status | Paths |
|---|---|---|
| **BE list** | **PARTIAL** | `transactions.service.ts` `listMerchants` returns `aliases` but **ignores** `q` despite `listMerchantsQuerySchema` (`packages/schemas/src/merchants.ts`) and api-client `q?: string` |
| **BE alias engine** | **NOT_STARTED** | Seed aliases only (`demo-household.ts` ICA/Netflix/…); no match-on-import / normalize service |
| **FE** | **PARTIAL** | Assign via `<select>` in `transaction-detail-page.tsx`; no search; no alias display |

**Decision: YES OWN (scoped) — usable search + assign; DEFER alias intelligence**

Tight scope:
- Implement `q` filter: `canonicalName` **or** any alias ILIKE.
- FE: filterable merchant picker (search box + filtered list) on transaction detail (and review if cheap).
- Optional cheap win: show primary alias under name in picker.
- Skip: import-time auto-normalize, merge merchants, confidence scoring, alias CRUD admin.

Matrix priority P2 — still U3-worthy because assign UX is product-facing and schema/`q` is already half-built.

---

### 4. Data-driven opportunity models OR leave heuristics labeled

| Layer | Status | Paths |
|---|---|---|
| **Engine** | **LABELED** (U2) | `packages/financial-engine/src/opportunities.ts` — `estimateBasis` / `estimateBasisForDetector`; heuristics remain (e.g. contract `1_200_00n`, subs 20%) |
| **API/FE** | **COMPLETE** for labels | Dashboard + opportunities pages surface `estimateBasis` |

**Decision: DEFER models; keep labeled heuristics**

U2 closed the compliance/product-honesty gap. Rewriting detectors is open-ended math, not polish. Matrix stays PARTIAL — acceptable for U3 stop line.

---

### 5. Broader jobs catalog beyond reconcile

| Layer | Status | Paths |
|---|---|---|
| **BE** | **PARTIAL / scaffold** | `apps/api/src/jobs/queue.ts` + `packages/schemas/src/jobs.ts`: `HEALTH_CHECK` + `RECONCILE_ACCOUNT_BALANCES` only |
| **FE** | **NONE** | No jobs UI |

**Decision: DEFER**

Matrix: Jobs catalog SCAFFOLD_ONLY / P2. Inventing risk/opportunity/async jobs without product consumers expands scope and ops surface. Reconcile job already satisfies the P0 ledger-truth path.

---

### 6. Broader E2E (budget edit, review resolve, vehicles)

| Layer | Status | Paths |
|---|---|---|
| **Product UX** | **EXISTS** | Budget edit: `budget-page.tsx` + `updateBudgetLine`; Review resolve: `review-page.tsx` + `resolveReview`; Vehicles: list/detail/costs/maintenance under `apps/web/src/components/vehicles/` |
| **E2E** | **THIN** | `e2e/critical-path.spec.ts`, `e2e/p1-u1-workflows.spec.ts` — no budget/review/vehicles flows |

**Decision: YES OWN (scoped)**

Tight scope: 3 Playwright flows (demo auth):
1. Budget — change one planned line, persist after reload  
2. Review — resolve/dismiss one item (or set category)  
3. Vehicles — list → detail visible (optional: purchase form if OWN #1 lands)

Skip: full matrix across documents/integrations/advisor; axe expansion beyond critical path.

---

## Other FEATURE_MATRIX / REMAINING_WORK P1 PARTIALs

| Item | After U1/U2 | U3? | Notes |
|---|---|---|---|
| available_to_invest | COMPLETE (U2) | — | Done |
| Auth refresh-on-401 | COMPLETE (U2) | — | Done |
| Invite/members/categories/goals/sinking edit | COMPLETE (U1/U2) | — | Done |
| Opportunity estimate labeling | COMPLETE (U2) | — | Done; models deferred |
| Runtime financial-event writes | COMPLETE (U1) | — | Done |
| Vehicle purchase seed/runtime story | Still broken narratively | **OWN** | See #1 |
| Broader E2E | Still thin | **OWN** | See #6 |
| Jobs beyond reconcile | Still scaffold | **DEFER** | See #5 |
| Merchant normalization | List+assign; no `q`/alias search | **OWN scoped** | See #3 |
| Dark mode | Preference only | **OWN** | See #2 |
| Audit logging UI | BE only | **DEFER** | Not user-blocking for polish |
| Recurring detection | Thin / no FE | **DEFER** | Separate batch |
| Budgets / review product | Usable | E2E only | Not rewrite |
| Mortgages / CC specialized UX | Forms in U2 | **DEFER** deeper rate-scenario polish |
| Documents / integrations / AI | PARTIAL | **DEFER** | Not U3 |
| Dashboard metric PARTIALs (NW, runway, …) | Engine-backed | **DEFER** | Model depth ≠ polish |
| Savings opportunities math | Labeled heuristics | **DEFER** | See #4 |

`REMAINING_WORK.md` P1 list is partially stale vs U1/U2 delivery; treat matrix + this audit as current. Stale `P0_REVERIFICATION.md` still claims financed purchase missing — **false** after R3 (API+tests exist); residual is **product UX + demo seed narrative**.

---

## Recommended tight U3 ownership checklist

1. **Seed:** one coherent financed vehicle purchase path; vehicleId linked; metadata matches ledger.  
2. **api-client:** `createFinancedAssetPurchase` (+ keep cash purchase).  
3. **Web:** vehicle purchase form (cash | financed) on vehicle detail (or costs).  
4. **Web:** ThemeApplicator from settings appearance.  
5. **API+Web:** merchants `q` (name+aliases) + searchable assign.  
6. **E2E:** budget edit, review resolve, vehicles detail (+ purchase smoke if time).  
7. **Docs:** update FEATURE_MATRIX notes for owned rows; U3 report; **do not** claim opportunity models or jobs catalog complete.

### Explicit non-goals (U3+)

- Opportunity detector math rewrite  
- New BullMQ job types / jobs UI  
- Merchant merge / import normalizer  
- Audit log UI, recurring product, leasing, market depth  
- en-US localization, full WCAG pass, Expo  

---

## Suggested scorecard (for U3 report)

| Item | Pass criteria |
|---|---|
| Vehicle purchase UX | Cash + financed forms create ledger events; client methods used |
| Seed narrative | Demo vehicle ownership/finance/ledger tell one story; purchase linked |
| Dark theme | Appearance dark/system visibly applies tokens |
| Merchant search | `q` filters aliases; assign UX searchable |
| E2E | Three scoped specs green |
| P0 regressions | Engine/API gates still green |

**STOP after this batch — do not start U4 scope creep inside U3.**
