# P1-U6 Scope — Final V1 product depth

**Branch:** `cursor/p1-u6-final-product-depth-9c58`  
**Base:** `cursor/p1-u5-remaining-product-9c58`  
**Date:** 2026-08-08  
**Constraint:** P0 financial core ACCEPTED — protected. No real externals / OCR / ML / redesign / speculative features.

## Audit sources

- `docs/PRODUCT_SPEC.md`, `docs/DATA_MODEL.md`, `docs/DOMAIN_INVARIANTS.md`
- `docs/completion/FEATURE_MATRIX.md` (P1-U5)
- `docs/acceptance/FINAL_ACCEPTANCE_REPORT.md` (**stale** vs P0 accepted)
- `docs/acceptance/REMAINING_WORK.md` (stale P0 list)
- `docs/completion/p1/P1_U1`–`P1_U5` reports
- Live code: vehicle intel/TCO/market, merchants, recommendation outcomes, AI tools

## Remaining P1 inventory (classified)

| ID | Item | Class | U6 action |
|---|---|---|---|
| V-MKT | Market analytics from persisted listings (comps, quartiles, trend, liquidity) | REQUIRED_FOR_V1 | OWN |
| V-VAL | Valuation range from comps; ask ≠ sale | REQUIRED_FOR_V1 | OWN |
| V-CAND | Candidate CRUD + from listing | REQUIRED_FOR_V1 | OWN |
| V-FIT | Household requirements MUST_HAVE/PREF/NICE | REQUIRED_FOR_V1 | OWN |
| V-CMP | Same-horizon compare + keep current | REQUIRED_FOR_V1 | OWN |
| V-REP | REPAIR_AND_KEEP / SELL_NOW / REPLACE | REQUIRED_FOR_V1 | OWN |
| V-WIN | Sell window + purchase window (insufficient-data-safe) | REQUIRED_FOR_V1 | OWN |
| V-LEASE | Private lease economics + mileage risk | REQUIRED_FOR_V1 | OWN |
| V-ACQ | Cash vs finance vs lease | REQUIRED_FOR_V1 | OWN |
| V-REC | Recommendation with evidence | REQUIRED_FOR_V1 | OWN |
| V-AI | Deterministic vehicle AI tools | REQUIRED_FOR_V1 | OWN |
| V-UI | Vehicle routes depth + mobile overview | REQUIRED_FOR_V1 | OWN |
| M-NORM | Deterministic merchant normalization | REQUIRED_FOR_V1 | OWN |
| M-ALIAS | Alias + user verify + audit | REQUIRED_FOR_V1 | OWN |
| M-REV | Low-confidence → Needs Review | REQUIRED_FOR_V1 | OWN |
| R-VER | EXPECTED vs VERIFIED impact foundation | REQUIRED_FOR_V1 | OWN |
| EXT-MKT | Real marketplace scraping | INTENTIONALLY_EXTERNAL_MOCK | Mock listings only |
| EXT-BANK | SEB/SBAB/Revolut/BankID | INTENTIONALLY_EXTERNAL_MOCK | Keep interfaces |
| EXT-OCR | OCR/PDF/CSV/Excel parsers | INTENTIONALLY_EXTERNAL_MOCK | Out of V1 |
| EXT-ML | ML anomalies | POST_V1 | Out |
| EXT-IOS | Native iOS | POST_V1 | Out |
| P2-LOC | en-US localization | P2 | Defer |
| P2-A11Y | Full WCAG | P2 | Defer |
| P2-FF | Feature-flag enforcement polish | P2 | Defer |
| P2-FCST | Forecast model research depth | P2 | Defer |
| DOC-OCR | Documents OCR depth | INTENTIONALLY_EXTERNAL_MOCK | Mock extract remains |
| IMP-DUP | Import duplicate prevention | P2 | Justified: mock intake; not blocking cohesive vehicle/merchant V1 |
| DASH-POLISH | Residual dashboard widget polish | P2 | Core metrics already Metric Registry–backed |
| REC-FE | Recurring FE | COMPLETE (U5) | — |
| JOBS-UI | Jobs status panel | COMPLETE (U5) | — |
| AUDIT-UI | Audit log UI | COMPLETE (U5) | — |
| ANOM-UI | Anomaly surface | COMPLETE (U5) | — |

## Critical P1 outside named U6 themes?

**No blocking REQUIRED_FOR_V1 gaps** beyond the U6 areas above for a cohesive Family Financial OS V1:

- Recurring confirm/dismiss, anomalies, audit, jobs status closed in U5.
- Import duplicate prevention and residual dashboard polish are **P2** with justification (mock intake / already ledger-truth metrics).
- Documents/connectors remain **INTENTIONALLY_EXTERNAL_MOCK**.

## Explicit non-goals

Real SEB/SBAB/Revolut/Kivra/BankID · real OCR/PDF/CSV/Excel · real marketplace scraping · trading/payments · ML anomalies · native iOS · U7 · P2 start.

## Stop

When U6 acceptance gates pass → STOP. Next: **V1 FINAL PRODUCT ACCEPTANCE** (separate instruction).
