# P1-U5 Scope — Ops surface (anomaly, audit, recurring)

**Branch:** `cursor/p1-u5-remaining-product-9c58`  
**Base:** `cursor/p1-u4-decision-jobs-9c58`

## OWN

1. **Anomaly product surface** — `GET /anomalies` (+ dismiss); show on Review/Insights; link to entities  
2. **Audit log UI** — household-scoped list for OWNER/ADMIN; Settings section  
3. **Recurring confirm/dismiss** — `PATCH` status on `recurring_items`; actions on subscriptions page  
4. **Jobs status (thin)** — persist recent analysis/job runs if table exists; Settings/ops panel last N runs  

## DEFER

- Merchant import normalizer  
- Vehicle market/leasing depth  
- Documents OCR / real connectors  
- Recommendation verified-impact analytics  
- More opportunity types / ML anomalies  
- Broad visual redesign  

## Constraints

- P0 financial core protected  
- Stop after OWN items + gates — do not start U6  
