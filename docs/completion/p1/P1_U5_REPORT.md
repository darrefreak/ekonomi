# P1-U5 Report — Ops surface (anomaly, audit, recurring, jobs status)

**Branch:** `cursor/p1-u5-remaining-product-9c58`  
**Base:** `cursor/p1-u4-decision-jobs-9c58`  
**Date:** 2026-08-08  
**Audit:** [`P1_U5_AUDIT.md`](./P1_U5_AUDIT.md) · **Scope:** [`P1_U5_SCOPE.md`](./P1_U5_SCOPE.md)

## Status

**P1-U5: COMPLETE (owned batch)**

P0 financial core remains protected. No U6 work started.

---

## Owned deliverables

| Item | Delivered |
|---|---|
| Anomaly product surface | `GET /api/v1/anomalies`, `POST …/dismiss`; Insights + Review UI |
| Audit log UI | `GET /api/v1/audit-logs` (OWNER/ADMIN); Settings section |
| Recurring confirm/dismiss | `PATCH /api/v1/recurring/:id` status; subscriptions actions |
| Jobs status (thin) | Handlers write `analysis_runs`; `GET /api/v1/analysis-runs`; Settings panel |

## Migration

- `0024_p1_u5_ops_surface.sql` — `anomaly_findings.dismissed_at`

## Explicitly deferred

- Merchant import normalizer  
- Vehicle market/leasing depth  
- Documents OCR / real connectors  
- Recommendation verified-impact analytics  
- ML anomalies / more opportunity types  
- Broad visual redesign  

## P0 protection

- No ledger rewrite, no float money, Metric Registry still sole metric truth, cache not treated as financial truth.

## Gates

| Gate | Result |
|---|---|
| typecheck (schemas/api/api-client/web) | pass |
| lint | pass |
| build (api/web + Docker images) | pass |
| API tests | **103/103** |
| schemas + engine tests | pass |
| Docker migrate + smoke | pass |

## Stop

Await next instruction — do not start U6.
