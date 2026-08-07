# Feature Completion Matrix

Audit date: 2026-08-07  
Statuses: COMPLETE | PARTIAL | SCAFFOLD_ONLY | MOCK_ONLY | NOT_STARTED | BROKEN | BLOCKED  

Columns: Status · Backend · Frontend · Tests · Mobile · Priority · Dependencies · Notes

Legend for layer columns: **C** complete · **P** partial · **S** scaffold · **M** mock · **N** none · **B** broken

---

## Foundation

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Authentication (login/register/JWT) | PARTIAL | P | P | S | P | P0 | — | No logout/revoke UI/API; register UI missing; refresh not in client |
| Household creation | PARTIAL | C | N | N | N | P1 | Auth | API exists; no onboarding UI |
| Household membership | PARTIAL | P | N | N | N | P0 | Auth | Membership gate yes; invite/list/manage UI no |
| Permissions / roles | SCAFFOLD_ONLY | S | N | N | N | P0 | Members | Enums stored; never authorized |
| Member privacy policies | SCAFFOLD_ONLY | S | N | N | N | P0 | Permissions | Column only |
| Audit logging | SCAFFOLD_ONLY | S | N | N | N | P1 | Auth | Only household create |
| Settings (product) | SCAFFOLD_ONLY | S | S | N | S | P1 | — | Hardcoded API; demo settings page |
| Localization sv-SE | PARTIAL | P | P | P | P | P2 | — | Swedish copy; en-US not wired |
| Appearance / dark mode | SCAFFOLD_ONLY | S | S | N | S | P2 | Tokens | Tokens mention dark; UI light-only |
| Feature flags | SCAFFOLD_ONLY | S | N | N | N | P2 | — | Not enforced |

---

## Money

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Accounts list/detail | PARTIAL | P | P | N | B | P1 | Core | Read-only; mobile via Mer broken |
| Account balances (cache) | MOCK_ONLY | M | P | N | B | P0 | Ledger | Not from postings |
| Balance snapshots | MOCK_ONLY | M | N | N | N | P0 | Ledger | Illustrative seed |
| Source transactions | PARTIAL | P | P | N | B | P1 | — | Read/filter; no edit |
| Financial events | PARTIAL | P | N | P | N | P0 | — | Seed persist; no runtime API |
| Ledger entries/postings | PARTIAL | P | N | C | N | P0 | Engine | Engine builders tested; runtime unused |
| Transaction splits | SCAFFOLD_ONLY | S | N | N | N | P0 | Events | Table unused |
| Internal transfers | PARTIAL | P | N | C | N | P0 | Ledger | Engine+seed; pairing incomplete |
| Credit card handling | PARTIAL | P | N | C | N | P0 | Ledger | Engine+seed; no product UX |
| Mortgage handling | PARTIAL | P | N | C | N | P0 | Ledger | Engine+seed; event type fidelity gap |
| Refunds / reimbursements | NOT_STARTED | N | N | N | N | P0 | Ledger | Enums only |
| Merchant normalization | PARTIAL | P | N | N | N | P2 | — | Seed merchants; no alias engine |
| Categories | PARTIAL | P | P | N | B | P1 | — | Taxonomy seeded; no user CRUD |
| Transaction editing | NOT_STARTED | N | N | N | N | P1 | Txns | — |
| Transaction filtering/search | PARTIAL | P | P | N | B | P1 | — | Page filter only |

---

## Dashboard

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Financial position (NW/cash/inv/debt) | PARTIAL | P | P | P | P | P0 | Balances | Snapshot + engine (WS A/C) |
| Month income/spend/savings/rate | PARTIAL | P | P | P | P | P0 | Events | Real from events |
| Net worth change | PARTIAL | P | P | P | P | P0 | Metrics | From events via snapshot (WS A) |
| Budget remaining | PARTIAL | P | P | P | P | P1 | Budget | Engine vs seed budget |
| Cash runway | PARTIAL | P | P | P | P | P1 | Cashflow | cash/spend via engine |
| Cashflow forecast widget | PARTIAL | P | P | P | P | P0 | Forecast | Engine 30/60/90 deltas (WS C) |
| Financial brief | PARTIAL | P | P | P | P | P1 | AI/Metrics | Opps + cashflow + review (WS C); AI later |
| Upcoming obligations | PARTIAL | P | P | P | P | P1 | Recurring | Subs/contracts/salary estimate |
| Opportunities on dashboard | PARTIAL | P | P | P | P | P2 | Opps | Aggregated + widget (WS C); detectors later |
| Coverage / freshness | PARTIAL | P | P | P | P | P1 | Accounts | Heuristic coverage |

---

## Planning

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Budgets (simple/detailed) | PARTIAL | P | P | P | P | P1 | Core | Editable planned; engine actuals (WS D) |
| Budget forecast | PARTIAL | P | P | P | B | P1 | Forecast | Variance math exists |
| Recurring | PARTIAL | P | N | N | N | P1 | — | Seed/detection foundation thin |
| Subscriptions | PARTIAL | P | P | P | B | P1 | — | Read + annualize |
| Contracts | PARTIAL | P | P | P | B | P1 | — | Read |
| Sinking funds | PARTIAL | P | P | P | P | P1 | Goals | Create/contribute UX (WS D) |
| Goals | PARTIAL | P | P | P | P | P1 | — | Create/contribute + progress (WS D) |
| Planned expenses | SCAFFOLD_ONLY | S | N | N | N | P2 | Forecast | — |
| Forecast horizons | PARTIAL | P | P | P | P | P0 | Core | Live 7d–12m engine (WS E); linear model |
| Forecast backtesting | PARTIAL | P | P | P | P | P2 | Forecast | Infra + lookback compare (WS E) |
| Scenarios | PARTIAL | P | P | P | P | P1 | Engine | Non-destructive simulate (WS E) |
| Available to invest | SCAFFOLD_ONLY | S | N | N | N | P1 | Policies | Spec only / thin |

---

## Wealth

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Net worth page | PARTIAL | M/P | P | N | B | P0 | Metrics | Hardcoded change/attribution |
| Investments | SCAFFOLD_ONLY | S | S | N | B | P1 | Accounts | Placeholder page |
| Assets | SCAFFOLD_ONLY | S | S | N | B | P1 | — | Placeholder |
| Debt dashboard | PARTIAL | P | P | P | P | P0 | Loans | List/detail + P vs I (WS F) |
| Mortgages product UX | PARTIAL | P | P | P | P | P1 | Debt | Rate scenarios + binding (WS F) |
| Valuation snapshots (assets) | SCAFFOLD_ONLY | S | N | N | N | P2 | — | Vehicle vals exist; housing thin |
| NW attribution | MOCK_ONLY | M | P | N | B | P1 | Metrics | Hardcoded |

---

## Optimize

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Savings opportunities | MOCK_ONLY | M | P | S | B | P1 | Core | Seed + hardcoded optimizer bits |
| Subscription analysis | PARTIAL | P | P | P | B | P1 | Subs | Price trend in seed |
| Contract renewal intel | PARTIAL | P | P | N | B | P1 | Contracts | Dates in seed |
| Lifestyle creep | NOT_STARTED | N | N | N | N | P2 | Cashflow | — |
| Anomaly detection | SCAFFOLD_ONLY | S | N | N | N | P1 | Review | Heuristic review only |
| Recommendation outcomes | PARTIAL | P | N | N | N | P2 | AI | Table + insert on brief; no UI |

---

## Risk

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Risk dimensions (liquidity/debt/…) | MOCK_ONLY | M | P | N | B | P1 | Core | Seeded risk rows |
| Financial health | PARTIAL | M | P | S | B | P1 | — | Trivial bands / seed |
| Live risk engine jobs | NOT_STARTED | N | N | N | N | P2 | Jobs | — |

---

## Vehicles

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Vehicle list/detail | PARTIAL | P | P | P | B | P1 | — | Seed-backed |
| Ownership / financing | PARTIAL | P | P | P | B | P1 | — | Leasing thin |
| Odometer / maintenance | PARTIAL | P | S | N | B | P1 | — | Maint page placeholder |
| Vehicle-linked transactions | SCAFFOLD_ONLY | S | N | N | N | P1 | Txns | Field/spec; weak wiring |
| Cash / economic / TCO / mil | PARTIAL | P | P | C | B | P1 | Engine | Engine real on seed inputs |
| Valuation / equity | PARTIAL | P | M | P | B | P1 | Market | Stored vals + engine equity |
| Candidates / compare / market | MOCK_ONLY | M | M | P | B | P1 | Market | Thin UI; seed analysis |
| Household fit | PARTIAL | P | M | P | B | P1 | — | Seed usage profile |
| Replacement / sell window | PARTIAL | M/P | M | P | B | P1 | Engine | Computed at seed; thin FE |
| Vehicle scenarios | SCAFFOLD_ONLY | S | N | N | N | P2 | — | — |

---

## Documents

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Financial inbox list | MOCK_ONLY | M | P | N | B | P1 | — | Seed docs |
| Object storage upload | NOT_STARTED | N | N | N | N | P1 | MinIO | MinIO up; unused |
| Statuses / review flow | SCAFFOLD_ONLY | S | N | N | N | P1 | — | Status enum in seed |
| Extraction model | MOCK_ONLY | M | N | N | N | P2 | — | Mock extract notes |
| Entity linking | NOT_STARTED | N | N | N | N | P2 | — | — |

---

## Connections

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Integrations list + health | MOCK_ONLY | M | P | N | B | P1 | — | Allowed external mock |
| Fake sync | MOCK_ONLY | M | P | N | B | P1 | — | Allowed |
| Source CRUD | NOT_STARTED | N | N | N | N | P1 | — | — |
| Import batches / history | MOCK_ONLY | M | P | N | B | P1 | — | Seed read |
| Raw records | PARTIAL | M | N | N | N | P2 | — | Seed only |
| Duplicate prevention | SCAFFOLD_ONLY | S | N | N | N | P1 | Imports | Fingerprints partial |
| Connector metadata | PARTIAL | P | N | N | N | P2 | — | Architecture stubs |

---

## AI

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Deterministic tool registry | PARTIAL | P | P | P | B | P1 | Core metrics | Brief tools |
| Advisor chat | NOT_STARTED | N | N | N | N | P2 | Tools | Route shows brief, not chat |
| Financial brief | PARTIAL | P | P | P | B | P1 | Tools | Template prose |
| Explainability / citations | PARTIAL | P | P | P | B | P1 | — | Tool trace shown |
| No arbitrary DB | COMPLETE | C | — | P | — | P0 | — | Tools only |
| Safety boundaries | PARTIAL | P | N | N | N | P0 | — | Read-only tools; no execute |
| Feature flag gate | BROKEN | B | N | N | N | P1 | Flags | AI flag false but endpoint open |

---

## Cross-cutting

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Global search | NOT_STARTED | N | S | N | N | P1 | — | “kommer snart” |
| Notification center | NOT_STARTED | N | N | N | N | P2 | — | — |
| Review queue | PARTIAL | P | P | N | B | P1 | Txns | Heuristic; no resolve |
| Reports / monthly / yearly | NOT_STARTED | N | N | N | N | P2 | Metrics | — |
| Quick actions | NOT_STARTED | N | N | N | N | P2 | — | — |
| Onboarding | NOT_STARTED | N | N | N | N | P1 | Auth | — |
| Demo mode / seed | PARTIAL | P | P | P | P | P1 | — | Deterministic seed; load-demo UX thin |
| Accessibility | PARTIAL | — | P | N | P | P2 | — | Skip link, focus; charts limited |
| Responsive UX | PARTIAL | — | P | N | B | P0 | Mer | Desktop OK; mobile Mer broken |
| Error/empty/loading | PARTIAL | — | P | N | P | P1 | — | Retry mostly dashboard-only |
| Observability | PARTIAL | P | N | N | N | P2 | — | Structured logs + request IDs |
| Performance (dashboard) | PARTIAL | P | P | N | P | P1 | — | Aggregated dashboard API exists |
| Security baseline | PARTIAL | P | P | N | P | P0 | — | See P0_ISSUES |
| Jobs catalog | SCAFFOLD_ONLY | S | N | N | N | P2 | Redis | HEALTH_CHECK only |
| iOS app | NOT_STARTED | — | — | — | N | P3 | Shared pkgs | Reserved |
| Real external connectors | BLOCKED | — | — | — | — | — | Compliance | Explicitly out of V1 |

---

## Status tallies (approximate)

| Status | Count (matrix rows) |
|---|---|
| COMPLETE | 1 |
| PARTIAL | ~55 |
| MOCK_ONLY | ~18 |
| SCAFFOLD_ONLY | ~22 |
| NOT_STARTED | ~18 |
| BROKEN | 2 (AI flag gate; mobile Mer / IA) |
| BLOCKED | 1 (real connectors) |

These counts are row-level and intentionally rough; use for prioritization, not as a score.

---

## Quality gate snapshot (repo-wide)

| Gate | Result | Notes |
|---|---|---|
| `pnpm build` | Pass | 2026-08-07 |
| `pnpm lint` | Pass | Echo stubs — not real lint |
| `pnpm typecheck` | Pass | |
| `pnpm test` | Pass | Thin suite |
| Docker | Healthy | Ports 3100/3101 via ports override |
| Desktop UX | Partial | Placeholders in nav |
| Mobile ~375 | Broken Mer | Overflow IA missing |
