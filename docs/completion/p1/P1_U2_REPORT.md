# P1-U2 Report — Product Completion

**Status:** COMPLETE  
**Branch:** `cursor/p1-u2-product-completion-9c58`  
**Base:** `cursor/p1-u1-core-workflows-9c58`  
**Date:** 2026-08-08  

P0 financial core protected (Metric Registry extended, not bypassed; exact money retained).

---

## Scope

See `P1_U2_SCOPE.md`.

---

## Delivered

| Item | Result |
|---|---|
| **available_to_invest** | Engine `calculateAvailableToInvest` + registry key + dashboard field with assumptions/disclaimer |
| **Auth refresh-on-401** | api-client single-flight refresh + web `setSession` / `clearSession` |
| **Opportunity estimate labeling** | `estimateBasis` on detectors + API + dashboard/opportunities UI |
| **Sinking fund edit** | Wired `updateSinkingFund` UX |
| **CC / mortgage / investment UX** | Product forms + api-client; optional system EXPENSE book resolution |
| **METRIC_BUNDLE_VERSION** | `1.1.0` (catalog + ATI) |

---

## Tests / gates

| Gate | Result |
|---|---|
| Engine tests | PASS (56) |
| API tests | PASS (92+) |
| Lint / typecheck / build | PASS |
| Docker `/health/ready` | PASS |
| P0 regressions | PASS |

---

## Deferred to U3+

- Vehicle purchase UX + seed narrative alignment  
- Dark theme application  
- Merchant alias engine  
- Data-driven opportunity models  
- Broader jobs catalog / broad E2E matrix  

---

## Scorecard

| Item | Result |
|---|---|
| available_to_invest | PASS |
| Auth refresh | PASS |
| Estimate labeling | PASS |
| Sinking fund edit | PASS |
| Specialized money UX | PASS |
| P0 regressions | PASS |
| Build / Lint / Typecheck / Tests / Docker | PASS |

**STOP — do not start U3.**
