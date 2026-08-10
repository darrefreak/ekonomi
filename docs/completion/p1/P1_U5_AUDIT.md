# P1-U5 Audit — Ops surface after U4

**Date:** 2026-08-08  
**Branch:** `cursor/p1-u5-remaining-product-9c58`  
**Base:** `cursor/p1-u4-decision-jobs-9c58`

## Verdict

Highest-value remaining P1 gaps are **BE-ready / product-surface missing** — not financial-core work.

| Own in U5 | Defer |
|---|---|
| Anomaly HTTP + UI | Merchant import normalizer |
| Audit log list UI | Vehicle market/leasing depth |
| Recurring confirm/dismiss | Documents OCR / real connectors |
| Thin jobs/analysis-run status | Verified recommendation impact / ML |

## Candidates

### 1. Anomalies — OWN

- BE: `AnomalyService` detect/persist/list (U4); job `RUN_ANOMALY_ANALYSIS`
- Gap: no controller route, no FE
- Scope: GET list, POST dismiss, Review section

### 2. Audit logs — OWN

- BE: `AuditService.record` only
- Gap: no list API/UI
- Scope: GET for OWNER/ADMIN; Settings section

### 3. Recurring actions — OWN

- BE: `recurring_items` seeded; nested under subscriptions read
- Gap: no PATCH; FE read-only
- Scope: CONFIRMED / DISMISSED / PAUSED actions

### 4. Jobs status — OWN thin

- `analysis_runs` table exists (U4 migration)
- Gap: handlers may not always write; no GET/UI
- Scope: ensure job handlers record runs; GET recent; Settings panel

**STOP after U5 — do not start U6.**
