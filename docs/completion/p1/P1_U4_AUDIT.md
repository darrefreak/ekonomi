# P1-U4 Audit — Decision engines, opportunities & jobs

**Date:** 2026-08-08  
**Branch:** `cursor/p1-u4-decision-jobs-9c58`  
**Base:** `cursor/p1-u3-product-polish-9c58`  
**P0:** ACCEPTED (protected)

---

## Verdict summary

| Area | Classification | U4 action |
|---|---|---|
| Opportunities | HEURISTIC | Replace fake savings with deterministic formulas + evidence |
| Insights | PARTIAL | Rebuild from ranked real analytics |
| Anomaly | DEAD / scaffold | V1 deterministic subset (large txn, recurring increase, duplicate candidate) |
| Risk | PARTIAL | Expose inputs/thresholds; keep request + optional job |
| Savings optimizer | HEURISTIC | Align with opportunity engine (same formulas) |
| Subscriptions | PARTIAL | Price-increase detector from history |
| Contracts | PARTIAL | Renewal without fabricated savings |
| Mortgage opp | HEURISTIC | Principal × rate delta (scenario-labeled) |
| Vehicle opp | PARTIAL + MOCK_EXTERNAL | TCO/equity/replacement with source labels |
| Forecast opps | PARTIAL | Budget overrun + cash surplus via shared engines |
| AI brief / tools | PARTIAL | Consume deterministic amounts only |
| BullMQ jobs | SCAFFOLD (2 types) | Real typed registry for V1 catalog |
| Metric registry ↔ jobs | PARTIAL | `CALCULATE_METRICS` job wrapping materialize |

**External mock data remains allowed. Internal fake analytical results do not.**

---

## Cross-cutting facts

- Product decision APIs are **request-path live-engine**, not job-driven.
- Seeded `opportunities` / `risk_signals` / `health_dimensions` rows are **unread** by live APIs (DEAD for product reads).
- Runtime job schema: only `HEALTH_CHECK` + `RECONCILE_ACCOUNT_BALANCES`.
- Heuristic literals to remove/replace: `1_200_00n` (contract), `/5n` (20% subs), `/10n` (~10% mortgage), seed `2_400_00n` / `1_800_00n`.

---

## Per-area detail

### 1. Opportunities — HEURISTIC → OWN

| Field | Current |
|---|---|
| DATA SOURCE | ACTIVE subscriptions; mortgage interest trailing; contracts; lifestyle creep spend |
| CALCULATION | `rankOpportunities([mortgage, subs-trim, contract, lifestyle])` |
| HARDCODED | Mortgage `/10n` of interest; subs `annual/5`; contract `N×1200`; creep `delta×12` |
| PERSISTED | Seed table unread; live IDs ephemeral (`live:…`) |
| JOB DRIVEN | No |
| EXPLAINABLE | `estimateBasis` labels only (U2 honesty) |
| USED BY UI | `/opportunities`, dashboard, AI |

**Paths:** `packages/financial-engine/src/opportunities.ts`, `apps/api/src/decisions/decisions.service.ts`, `apps/web/src/components/decisions/opportunities-page.tsx`

### 2. Insights — PARTIAL → OWN (thin rebuild)

Aggregator of top opps/risk/optimizer. No dedicated model. Headline static.

### 3. Anomaly — DEAD → OWN V1 subset

No engine. Review queue is triage. Seed `anomaly-swish-1` is demo txn only.  
**U4:** large txn, duplicate candidate, recurring price increase, missing expected income (where data supports).

### 4. Risk — PARTIAL → OWN polish

Live `assess*Risk` with hardcoded score curves. Seed tables unread. Fixed-cost uses subscriptions only.

### 5–7. Subs / contracts / mortgage — PARTIAL/HEURISTIC → OWN

See opportunity detectors. Debt rate shocks (`MORTGAGE_RATE_SHOCKS_BPS`) already REAL_DETERMINISTIC for UX scenarios.

### 8. Vehicle — PARTIAL + MOCK_EXTERNAL → OWN scoped

TCO/equity REAL; keep/replace over mock listings. Surface as vehicle opportunities with source tags.

### 9. Forecast-derived — PARTIAL → OWN

`calculateAvailableToInvest` exists (U2). Budget overrun + surplus must share that engine. Linear forecast REAL given inputs.

### 10–11. AI brief / tools — PARTIAL → OWN

Tools already wrap engines. Brief must use current ranked results; no invented %.

### 12. Jobs — SCAFFOLD → OWN

| Type | Status |
|---|---|
| HEALTH_CHECK | Present (noop ping) |
| RECONCILE_ACCOUNT_BALANCES | Present (real) |
| CALCULATE_METRICS | Missing → wrap MetricRegistry |
| GENERATE_FORECAST | Missing → wrap DecisionsService.forecast |
| GENERATE_OPPORTUNITIES | Missing → new generator + persist |
| RUN_RISK_ANALYSIS | Missing → wrap risk |
| RUN_ANOMALY_ANALYSIS | Missing → new V1 rules |
| GENERATE_INSIGHTS | Missing → wrap insights rebuild |
| GENERATE_AI_BRIEF | Missing → wrap AdvisorService.brief |
| PROCESS_DOCUMENT | Missing → wrap mock extract |
| SYNC_INTEGRATION | Missing → wrap fakeSync |

### 13. Metric registry — PARTIAL → OWN job wrap

Request-path materialize works. No invalidation map. Mutations sync-refresh ledger cache only.

---

## Hardcoded savings to eliminate

| Literal | Location | Replacement |
|---|---|---|
| `interest/10` | mortgage opp | Principal × (currentBps − scenarioBps) / 10000 |
| `annual/5` | subs trim | Recurring amount series Δ × 12 (price increase) |
| `N × 1_200_00n` | contract | Nullable impact; renewal deadline only |
| Seed 2400/1800 | seed-decisions | Stop treating as truth; live persist from engine |

---

## U4 ownership checklist

1. Opportunity domain + persist + dedupe + lifecycle  
2. Deterministic detectors (mortgage, subscription increase, recurring increase, cash surplus, budget overrun, spending trend, contract renewal, vehicle TCO/replacement)  
3. Confidence + priority models + structured evidence  
4. Job registry + worker handlers + validation + idempotency  
5. Invalidation map after financial mutations  
6. Anomaly V1 + risk explainability  
7. AI/brief consume deterministic results  
8. Opportunities UI + tests + REPORT  

### Explicit non-goals (unless required)

- Full vehicle market/leasing depth  
- Full merchant normalizer  
- Audit UI  
- ML anomaly models  
- Inventing empty job names  

**STOP after U4 — do not start U5.**
