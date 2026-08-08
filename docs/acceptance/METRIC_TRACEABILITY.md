# Metric Traceability

**Audit date:** 2026-08-07  
Path: DATABASE → DOMAIN → ENGINE → SERVICE → API → API-CLIENT → UI  

Verdicts: `REAL` · `CACHE_DEPENDENT` · `HEURISTIC` · `HARDCODED` · `MISSING`

No critical dashboard/NW metric found hardcoded in UI or API assemblers.

---

| Metric | Trace | Verdict | Notes |
|---|---|---|---|
| Net worth | `accounts.currentBalanceMinor` → `calculateNetWorth` → `HouseholdMetricsService` → dashboard/NW API → client → UI | CACHE_DEPENDENT | Engine math real; inputs from cache not live reconstruct |
| Available cash | Typed account buckets in metrics → position | CACHE_DEPENDENT | |
| Investments | Investment account types sum → metrics/wealth | CACHE_DEPENDENT | |
| Debt | Liability accounts + debt service events | CACHE_DEPENDENT / REAL | Debt page also uses ledger events for P/I |
| Monthly income | Period events/txns → metrics/cashflow engine | REAL | |
| Monthly spending | Same | REAL | |
| Savings | Income − spend (period metrics) | REAL | |
| Savings rate | `savings-rate` engine | REAL | Uses Number for ratio only |
| Cash runway | `cashRunwayMonths` engine | REAL | cash / monthly spend |
| Budget forecast / remaining | Budget lines + actuals via planning metrics | REAL (partial inputs) | Planned editable |
| Cashflow forecast | `forecastCashflowDeltas` live-engine | REAL | Linear model |
| Available to invest | dashboard.availableToInvest | PASS (P1-U2) | Engine + dashboard; assumptions exposed |
| Mortgage interest | Mortgage payment events / debt engine | REAL | Seed builders; runtime read |
| Debt reduction | Principal portion from mortgage builder / debt API | REAL | |
| Vehicle TCO | `vehicleCostEvents` → engine TCO → vehicles API | REAL (seed inputs) | |
| Vehicle cost per mil | TCO / mileage | REAL | |
| Vehicle equity | Valuation − loan | REAL (partial) | Valuation mock/mid; loan seeded |
| Vehicle valuation | Market snapshots / mid | HEURISTIC / MOCK_EXT | Listings mock; compare live |
| Financial coverage | Heuristic coverage service `/api/v1/coverage` | HEURISTIC | On dashboard + coverage API |

---

## Hardcode search (product paths)

| Location | Result |
|---|---|
| `dashboard.service.ts` | No fixed SEK outcomes |
| `net-worth.service.ts` | Metrics-driven |
| Web dashboard components | Render API money objects |
| Opportunities | Live detectors; **heuristic** `1_200_00n` contract saving |

---

## Serialization

| Check | Result |
|---|---|
| `amountMinor` as string in JSON | Yes (`moneyToJson`) |
| bigint domain | Yes (`packages/domain`) |
| Float money input | **FAIL path:** `apps/web/src/lib/money-input.ts` uses `Number * 100` |
