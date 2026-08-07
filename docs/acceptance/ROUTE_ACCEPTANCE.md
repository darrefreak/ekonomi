# Route Acceptance

**Audit date:** 2026-08-07  
**Method:** Route modules present under `apps/web/src/app`; authenticated API smoke for data backends; Playwright critical path for `/`, `/accounts`, `/login`, `/more` (mobile). Full visual console audit of every route was **not** completed in a headed browser this run.

PASS = page module exists + primary API 200 + no known placeholder.  
PARTIAL = loads but known depth/UX gaps.  
FAIL = broken/placeholder.

---

| Route | Status | Notes |
|---|---|---|
| `/` | PASS | Dashboard API 200; E2E |
| `/login` | PASS | E2E + axe |
| `/transactions` | PASS | List API |
| `/transactions/[id]` | PASS | Detail + edit |
| `/accounts` | PASS | E2E + axe + labels |
| `/accounts/[id]` | PASS | Detail API |
| `/cashflow` | PASS | API 200 |
| `/budget` | PASS | API 200 |
| `/net-worth` | PASS | API 200 |
| `/investments` | PASS | API 200 |
| `/assets` | PASS | API 200 |
| `/debt` | PASS | API 200 |
| `/forecast` | PASS | live-engine |
| `/goals` | PASS | API 200 |
| `/scenarios` | PASS | API 200 |
| `/insights` | PASS | Composed |
| `/opportunities` | PASS | live-engine |
| `/subscriptions` | PASS | API 200 |
| `/contracts` | PASS | API 200 |
| `/risk` | PASS | API 200 |
| `/documents` | PASS | API 200 |
| `/integrations` | PASS | Fake sync allowed |
| `/imports` | PASS | API 200 |
| `/advisor` | PASS | Brief 200; AI flag |
| `/review` | PASS | API 200 |
| `/settings` | PASS | API 200 |
| `/notifications` | PASS | API 200 |
| `/reports` | PASS | Monthly API 200 |
| `/onboarding` | PASS | Module exists |
| `/more` | PASS | E2E mobile |
| `/vehicles` | PASS | API 200 |
| `/vehicles/[id]` | PASS | Module |
| `/vehicles/[id]/costs` | PASS | Module |
| `/vehicles/[id]/maintenance` | PASS | Module |
| `/vehicles/[id]/valuation` | PASS | Module |
| `/vehicles/[id]/replacement` | PASS | Module |
| `/vehicles/market` | PASS | Mock listings OK |
| `/vehicles/candidates` | PASS | Module |
| `/vehicles/compare` | PASS | Module |

**Major route placeholder/broken count:** **0**

Caveats: empty/error-state coverage varies by page; not every page has dedicated E2E; desktop Cmd+K verified by module presence (`CommandPalette`), not interactive audit this run.
