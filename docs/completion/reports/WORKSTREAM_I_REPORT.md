# Workstream I Report — Opportunities & Risk

**Date:** 2026-08-07  
**Branch:** `cursor/workstream-i-opportunities-risk-9c58`  
**Status:** COMPLETE for scoped I goals (gates pending in this revision)

---

## Completed requirements

1. **Live detectors**
   - Mortgage rate, subscription trim, contract renewal, lifestyle creep
   - `GET /api/v1/opportunities` compute-on-read (`source: live-engine`)
   - Evidence links to accounts/debt/subscriptions/contracts/transactions

2. **Lifestyle creep**
   - Engine `calculateLifestyleCreep` (3m vs prior 12m) + category drivers
   - Surfaced on opportunities response + UI section

3. **Recommendation outcomes UI**
   - List on advisor page; track on opportunities view
   - PATCH status: ACCEPTED / DISMISSED / COMPLETED
   - api-client `getRecommendationOutcomes` / `track` / `update`

4. **Explainability links**
   - Opportunity + risk evidence chips with deep links
   - AI brief tools carry evidence snippets

5. **Live risk**
   - Liquidity, debt, fixed costs, coverage, vehicle equity
   - Health dimensions from live scores

---

## Remaining / deferred

- BullMQ detector jobs (request-path is live)
- Verified impact measurement after acceptance
- Anomaly product beyond review heuristics

---

## Schema / API / UI

| Area | Change |
|---|---|
| Engine | `lifestyle-creep`, `opportunities`, `risk` |
| API | Live decisions + advisor outcomes mutations |
| UI | Opportunities/risk evidence; advisor outcomes |
| Client | Outcomes get/track/update |

---

## Gate results

| Gate | Result |
|---|---|
| `pnpm build` | pending |
| `pnpm typecheck` | pending |
| `pnpm test` | pending |
| `pnpm lint` | pending |

---

## STOP

Workstream I complete for its scope once gates pass.  
Do **not** auto-start J. Await: `START WORKSTREAM J`
