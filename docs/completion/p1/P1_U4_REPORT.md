# P1-U4 Report — Decision engines, opportunities & real background jobs

**Branch:** `cursor/p1-u4-decision-jobs-9c58`  
**Base:** `cursor/p1-u3-product-polish-9c58`  
**Date:** 2026-08-08  
**Audit:** [`P1_U4_AUDIT.md`](./P1_U4_AUDIT.md)

## Status

**P1-U4: COMPLETE (owned batch)**

P0 financial core remains protected.

---

## Heuristic / static analytics found → replaced

| Was | Now |
|---|---|
| Mortgage save ≈ 10% of interest | Principal × scenario Δbps (default −25 bp), scenario-labeled |
| Subs trim ≈ 20% of annual | Price series (current − previous) × 12 with thresholds |
| Contract save = N × 1 200 kr | Nullable impact; deadline review only |
| Optimizer invented % items | Pass-through of deterministic opportunity impacts |
| Seed opps unread as “truth” | Live upsert by `identityKey` + evidence |

---

## Opportunity formulas (opp-v1.0.0)

| Type | Formula (summary) |
|---|---|
| MORTGAGE_RATE | `(I(currentBps) − I(scenarioBps)) × 12` via `monthlyInterestFromRateMinor` |
| SUBSCRIPTION_PRICE_INCREASE | `(monthly_now − monthly_prev) × 12` if abs/%% thresholds |
| RECURRING_COST_INCREASE | Same as subscription on recurring series |
| CASH_SURPLUS | `calculateAvailableToInvest` (shared with Available to Invest) |
| BUDGET_OVERRUN | `actual + forecastRemaining − planned` if periodProgress ≥ 25% |
| SPENDING_TREND | Lifestyle-creep 3m vs 12m baseline |
| CONTRACT_RENEWAL | Deadline window; impact UNKNOWN |
| VEHICLE_COST | Monthly economic TCO × 12 over threshold / negative equity |
| VEHICLE_REPLACEMENT | `keepVsReplace` when recommendation=replace; mock source labeled |

Thresholds: `OPPORTUNITY_THRESHOLDS` in engine.

---

## Confidence model (V1)

Weighted: coverage 30% + freshness 25% + sample size 25% + source reliability 20% → score 0..1 → low/medium/high.

Mock external inputs reduce source reliability (e.g. vehicle market).

---

## Priority model (V1)

`impactScore × confidenceScore × easeScore × (1 − riskPenalty)`  
Impact normalized vs 50 kkr/year reference. Components exposed on each opportunity.

---

## Job registry

Typed definitions in `apps/api/src/jobs/registry.ts` + Zod payloads in `@ffos/schemas`.

| Job | Real work |
|---|---|
| HEALTH_CHECK | Ping |
| RECONCILE_ACCOUNT_BALANCES | LedgerTruth reconcile |
| CALCULATE_METRICS / CALCULATE_NET_WORTH | MetricRegistry materialize |
| GENERATE_FORECAST | Decisions forecast |
| GENERATE_OPPORTUNITIES | OpportunitiesGenerator upsert |
| RUN_RISK_ANALYSIS | Decisions risk |
| RUN_ANOMALY_ANALYSIS | AnomalyService |
| GENERATE_INSIGHTS | Insights from live analytics |
| GENERATE_AI_BRIEF | Advisor brief from tools |
| PROCESS_DOCUMENT | Intake mock extract |
| SYNC_INTEGRATION | Intake fakeSync |

Idempotency: BullMQ `jobId` per type/household/asOf (+ identity upsert for opps/anomalies). Payload validated before handlers.

---

## Invalidation strategy

After ledger economic commit (`afterCommit`): fire-and-forget enqueue `CALCULATE_METRICS` + `GENERATE_OPPORTUNITIES` (non-blocking). Category-only metadata does not trigger balance jobs.

---

## Anomaly rules (anomaly-v1.0.0)

- Unusually large transaction vs median  
- Duplicate candidate (amount + merchant, short window)  
- Missing expected income (recurring past grace)

---

## Risk

Request-path live scores retained; `RUN_RISK_ANALYSIS` job wraps same engine. Inputs/levels exposed on `/risk`.

---

## AI integration

Advisor tools still read opportunities/risk/metrics. Brief prose uses tool payloads — amounts come from deterministic engines, not LLM math.

---

## Lifecycle / dedupe

Persist by `(householdId, identityKey)`. DISMISSED not auto-resurrected unless review window + material `inputHash` change. Statuses include NEW/ACTIVE/VIEWED/ACCEPTED/DISMISSED/COMPLETED/EXPIRED.

---

## Gates

| Gate | Result |
|---|---|
| typecheck / lint / build | Pass |
| Engine tests | 63 pass |
| API tests | 102 pass (incl. jobs integration + generator) |
| Schemas tests | Pass |
| Docker | Rebuild/migrate as part of deploy path |

---

## Remaining deferred (not U4)

- Full vehicle market/leasing depth  
- Full merchant import normalizer  
- Audit UI  
- ML anomaly models  
- en-US localization / Expo  

**STOP — do not start U5.**
