# Product Completion Plan

Based on repository audit 2026-08-07 (see MASTER_GAP_ANALYSIS.md).  
**Do not treat ROADMAP phase checkmarks as product complete.**

Execution model: **Product Completion Workstreams A–O**.  
After each workstream: report under `docs/completion/reports/`, then **STOP** until explicitly started.

---

## 1. Completeness vocabulary (mandatory)

| Tier | Meaning |
|---|---|
| FOUNDATION COMPLETE | Platform + demo path exists |
| FEATURE COMPLETE | Definition of Done for that feature (program §9–10) |
| PRODUCT COMPLETE | All in-scope workstreams FEATURE COMPLETE |

Current repo: **FOUNDATION COMPLETE only**.

Action when work resumes: revise `docs/ROADMAP.md` status language to match these tiers (documentation change in Workstream O or at start of A).

---

## 2. Non-goals (still out of scope)

Do not implement forbidden real integrations:

Bank/open banking connectors, BankID, OCR/PDF parsers, marketplace scraping, payment execution, automation LEVEL 3/4 execute.

External **mocks** remain allowed.

---

## 3. Workstream sequence (confirmed)

Dependencies justify keeping the default order:

| WS | Name | Why this order |
|---|---|---|
| **A** | Financial core correctness | Unblocks all truthful metrics |
| B | Transactions & accounts | User-facing money CRUD on honest ledger |
| C | Dashboard | Aggregates only after A |
| D | Budget & planning | Needs honest actuals |
| E | Forecast & scenarios | Needs balances + recurring |
| F | Debt & mortgages | Specialized wealth |
| G | Wealth & investments | Placeholders → real |
| H | Vehicle intelligence | Internal analysis real; market feed may stay mock |
| I | Opportunities & risk | Deterministic engines on real data |
| J | Documents & inbox | Workflow (OCR still mock) |
| K | Integrations & imports | V1 architecture UX |
| L | AI advisor | Only after tools see reliable metrics |
| M | Product operations | Search, settings, onboarding, reports |
| N | Privacy & security | Harden roles/policies/tests (P0 items start in A/N) |
| O | Product quality | Lint reality, a11y, E2E, dead code |

**Security/privacy P0s:** begin minimal fixes in A (metric honesty) and continue systematically in **N**. Mobile Mer (P0-6) may be a small emergency fix before or during B/C if it blocks verification — document if pulled forward.

---

## 4. Workstream A — entry criteria & scope

### Enter now when instructed: `START WORKSTREAM A`

### A must deliver

1. **Ledger truth path**  
   - Document and implement how `ledger_postings` produce or verify `currentBalance` / snapshots.  
   - Seed ending balances either derived or reconciled with automated check.

2. **Remove hardcoded product financials** from:  
   - `dashboard.service.ts` (NW change, forecast, upcoming, static mortgage tip where replaceable)  
   - `net-worth.service.ts` (change + attribution)  
   - Replace with engine calculations over household data (or explicit “unavailable” empty states).

3. **Refunds foundation**  
   - Engine builders + seed example + metrics netting rule.

4. **Splits / transfer integrity**  
   - At least one real `transaction_splits` usage OR document deferral with test proving mortgage split via postings remains authoritative.  
   - Transfer pairing or reconciliation_group written for internal transfers.

5. **Metric consistency starter**  
   - Shared service path for NW, savings rate, cash used by dashboard + NW page (same asOf).  
   - Introduce calculation metadata fields where schemas already allow / minimal migration if needed.

6. **Tests**  
   - Unit: refunds, balance reconstruction or reconciliation assertion.  
   - Integration: seeded household dashboard NW change matches engine from events (no magic constants).

7. **Report**  
   - `docs/completion/reports/WORKSTREAM_A_REPORT.md`  
   - Gates: build, typecheck, test, Docker; real lint still may wait for O unless cheap to fix.

### A explicitly defers

- Full UI mutations (B)  
- Full privacy enforcement UI (N) — but do not add new endpoints that widen IDOR  
- Vehicle market UI (H)  
- AI chat (L)

### A exit Definition of Done

- No hardcoded SEK majors on dashboard/NW product paths for audited fields  
- Balances reconcilable to ledger within documented tolerance (ideally exact)  
- Tests prove transfer/CC/mortgage + new refund path  
- Same NW/savings rate on dashboard and NW page for demo household  
- Report filed; **STOP**

---

## 5. Later workstream capsules (for planning only)

### B — Transactions & accounts
CRUD/edit/classify/filter; empty states; every control works; Mer menu minimum for mobile verification.

### C — Dashboard
All widgets from aggregated APIs; opportunities/upcoming real; loading/error/empty.

### D — Budget & planning
Editable budgets, sinking funds UX, goals contributions; actuals from engine.

### E — Forecast & scenarios
Horizons 7d–12m deterministic; backtesting infra; scenario engine non-destructive.

### F — Debt & mortgages
Replace `/debt` placeholder; rate scenarios; principal vs interest.

### G — Wealth & investments
Replace `/assets` `/investments`; NW history from snapshots; attribution real.

### H — Vehicles
Full IA; link costs to vehicleId; compare/replace/sell window from live analysis over mock listings.

### I — Opportunities & risk
Live detectors; lifestyle creep; recommendation outcomes UI; explainability links.

### J — Documents
Upload via MinIO abstraction; status workflow; mock extraction; link to entities.

### K — Integrations
Source CRUD; reconnect UX; import history; coverage/freshness honest.

### L — AI
Chat + brief; tools only; flag gated; no invented numbers; citations.

### M — Product ops
Search, notifications, reviews resolve, reports, settings/policies, onboarding, demo loader.

### N — Privacy & security
Roles, aggregate-only, logout/revoke, rate limit, headers, audit, export/delete foundation, authz tests.

### O — Quality
Real ESLint, E2E critical flows, a11y pass, performance, dead-code removal, ROADMAP tier language.

---

## 6. Vertical slice discipline

Within each workstream, prefer one feature at a time:

schema → migration → domain/engine → service → API → api-client → UI → tests → UX check (375 + desktop)

---

## 7. Reporting template

Each `docs/completion/reports/WORKSTREAM_X_REPORT.md` must include program §18 fields and gate results.  
Do not mark COMPLETE if critical requirements remain.

---

## 8. Immediate next instruction

Audit complete. **Await:**

```text
START WORKSTREAM A
```

Do not begin B–O or speculative features before A is accepted.
