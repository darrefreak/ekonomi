# Final Feature Matrix (reality)

**Audit date:** 2026-08-07  
**Source of truth:** code + runtime APIs on Workstream O tip  
**Statuses:** COMPLETE · PARTIAL · SCAFFOLD_ONLY · MOCK_ONLY · BROKEN · NOT_STARTED  

COMPLETE requires original product DoD (not merely “route exists”).

Legend layers: BE / FE / Persist / Tests / Mobile / Errors / Empty / Security

---

## Foundation

| Feature | Status | BE | FE | Persist | Tests | Mobile | Err | Empty | Sec | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Auth login/register/JWT | PARTIAL | C | C | C | P | C | C | — | C | Refresh not auto-wired in client |
| Logout / revoke | COMPLETE | C | C | C | C | C | C | — | C | WS N |
| Household create | PARTIAL | C | C | C | N | P | C | — | C | Onboarding; invite missing |
| Membership / roles | PARTIAL | C | P | C | C | P | C | — | C | Enforced; manage UI missing |
| Privacy policies | PARTIAL | C | C | C | C | P | C | — | C | Projection + settings |
| Audit logging | PARTIAL | C | N | C | P | N | — | — | C | Key actions only |
| Settings | PARTIAL | C | C | C | P | P | C | — | C | Appearance not applied |
| Dark mode | SCAFFOLD_ONLY | S | S | P | N | S | — | — | — | Stored only |
| Feature flags | PARTIAL | C | N | C | P | N | — | — | P | AI gated; others thin |
| Localization | PARTIAL | P | P | P | N | P | — | — | — | sv-SE primary |

---

## Money / ledger

| Feature | Status | BE | FE | Persist | Tests | Mobile | Err | Empty | Sec | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Accounts list/detail | PARTIAL | C | C | C | P | C | C | C | C | Mutations exist; privacy projection |
| Balances as ledger SoT | PARTIAL | P | C | P | P | C | — | — | C | Cache-first reads; seed reconstruct |
| Balance snapshots | PARTIAL | P | P | P | P | P | — | — | C | History rebuilt when sparse |
| Source transactions | PARTIAL | C | C | C | P | C | C | C | C | Filter/search/edit category |
| Financial events runtime API | SCAFFOLD_ONLY | S | N | C | P | N | — | — | — | Seed persist only |
| Ledger builders | PARTIAL | C | N | P | C | N | — | — | — | Engine tested; unused at runtime writes |
| Transaction splits product | SCAFFOLD_ONLY | S | N | P | N | N | — | — | — | Seed writes; no API |
| Internal transfers product | PARTIAL | P | N | P | C | N | — | — | — | Engine+seed; no pairing UX |
| Credit card product UX | PARTIAL | P | N | P | C | N | — | — | — | Engine+seed |
| Mortgage product UX | PARTIAL | C | C | P | C | C | C | C | C | Debt pages; event fidelity gaps |
| Refunds runtime | PARTIAL | P | N | P | C | N | — | — | — | Builders+seed; no product path |
| Categories CRUD | PARTIAL | P | P | C | N | P | — | — | C | Seed taxonomy; no user CRUD |
| Txn edit/classify | PARTIAL | C | C | C | P | C | C | — | C | Category/notes/tags/exclude |

---

## Dashboard & metrics

| Feature | Status | BE | FE | Persist | Tests | Mobile | Err | Empty | Sec | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Position NW/cash/inv/debt | PARTIAL | C | C | P | P | C | C | — | C | From metrics over cache |
| Month income/spend/savings | PARTIAL | C | C | C | P | C | C | — | C | Events via metrics |
| NW change / attribution | PARTIAL | C | C | P | P | C | C | — | C | Engine attribution |
| Cash runway | PARTIAL | C | C | — | C | C | — | — | C | Engine |
| Forecast widget | PARTIAL | C | C | — | P | C | — | — | C | Live-engine deltas |
| Brief | PARTIAL | C | C | — | P | C | — | — | C | Opps+cashflow+review |
| Coverage / freshness | PARTIAL | C | C | — | N | C | — | — | C | Heuristic; `/api/v1/coverage` |
| Available to invest | NOT_STARTED | N | N | N | N | N | — | — | — | Spec only |
| Metric registry | SCAFFOLD_ONLY | S | N | N | P | N | — | — | — | Shared service ≠ registry |

---

## Planning / wealth / decisions

| Feature | Status | Notes |
|---|---|---|
| Budgets editable | PARTIAL | Planned editable; actuals from engine |
| Goals / sinking funds | PARTIAL | Create/contribute; update APIs underused |
| Subscriptions / contracts | PARTIAL | Read + annualize |
| Forecast / scenarios | PARTIAL | Live simulate; linear model |
| Backtesting | PARTIAL | Lookback compare |
| Net worth page | PARTIAL | History + attribution |
| Investments / assets | PARTIAL | List + contributions/links |
| Debt dashboard | PARTIAL | P vs I + scenarios |
| Opportunities / risk | PARTIAL | Live detectors; heuristic savings |
| Lifestyle creep | PARTIAL | Engine surfaced |
| Insights | PARTIAL | Composition of above |

---

## Vehicles

| Feature | Status | Notes |
|---|---|---|
| Vehicle CRUD foundation | PARTIAL | Seeded + detail UI |
| Costs / TCO / per mil | PARTIAL | Engine over cost events |
| Financing / equity | PARTIAL | Linked loan + equity math |
| Valuation / market | PARTIAL | Mock listings; live compare/replace |
| Depreciation ledger | NOT_STARTED | Cost event only; no ASSET write-down builder |
| Replacement / candidates | PARTIAL | Live over mock asks |

---

## Intake / AI / ops

| Feature | Status | Notes |
|---|---|---|
| Documents upload/workflow | PARTIAL | Upload + mock extract + links |
| Integrations fake sync | MOCK_ONLY | Allowed external mock |
| Import history | PARTIAL | Present |
| AI advisor tools-only | PARTIAL | Flag gated; citations; no LLM |
| Search / notifications / reports | PARTIAL | Functional |
| Onboarding / demo loader | PARTIAL | Functional |
| Review resolve | PARTIAL | Resolve actions work |

---

## Quality / security / platform

| Feature | Status | Notes |
|---|---|---|
| Real ESLint | COMPLETE | Product packages |
| E2E critical path | PARTIAL | Playwright; Docker fallback |
| a11y critical pages | PARTIAL | axe serious/critical on login/dash/accounts |
| Rate limit / helmet / secrets | PARTIAL | Baseline; validation breadth gap |
| Jobs (BullMQ) | SCAFFOLD_ONLY | Health only |
| Native mobile app | NOT_STARTED | Reserved |

---

## Counts (major product features in this matrix)

| Status | Approx. count |
|---|---|
| COMPLETE | ~3 |
| PARTIAL | ~55 |
| SCAFFOLD_ONLY | ~6 |
| MOCK_ONLY | ~2 (allowed external + residual) |
| NOT_STARTED | ~4 |
| BROKEN | 0 observed on major routes |

**Incomplete major features (not COMPLETE):** **~67**
