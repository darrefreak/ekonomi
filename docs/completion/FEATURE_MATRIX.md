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
| Settings (product) | PARTIAL | P | P | P | B | P1 | — | Persisted policies + members (WS M) |
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
| Opportunities on dashboard | PARTIAL | P | P | P | P | P2 | Opps | Aggregated live detectors (WS C/I) |
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
| Net worth page | PARTIAL | P | P | P | B | P0 | Metrics | Snapshot history + engine attribution (WS G) |
| Investments | PARTIAL | P | P | P | B | P1 | Accounts | List + trailing contributions (WS G) |
| Assets | PARTIAL | P | P | P | B | P1 | — | ASSET accounts + vehicle link (WS G) |
| Debt dashboard | PARTIAL | P | P | P | P | P0 | Loans | List/detail + P vs I (WS F) |
| Mortgages product UX | PARTIAL | P | P | P | P | P1 | Debt | Rate scenarios + binding (WS F) |
| Valuation snapshots (assets) | SCAFFOLD_ONLY | S | P | N | N | P2 | — | Vehicle vals linked; housing thin |
| NW attribution | PARTIAL | P | P | P | B | P1 | Metrics | Engine-driven (WS A/G); MTM deferred |

---

## Optimize

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Savings opportunities | PARTIAL | P | P | P | B | P1 | Core | Live detectors + evidence (WS I) |
| Subscription analysis | PARTIAL | P | P | P | B | P1 | Subs | Feeds live subs-trim detector |
| Contract renewal intel | PARTIAL | P | P | P | B | P1 | Contracts | Live renewal detector (WS I) |
| Lifestyle creep | PARTIAL | P | P | P | B | P2 | Cashflow | 3m vs 12m + drivers (WS I) |
| Anomaly detection | SCAFFOLD_ONLY | S | N | N | N | P1 | Review | Heuristic review only |
| Recommendation outcomes | PARTIAL | P | P | P | B | P2 | AI | List + status actions (WS I) |

---

## Risk

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Risk dimensions (liquidity/debt/…) | PARTIAL | P | P | P | B | P1 | Core | Live scores + evidence (WS I) |
| Financial health | PARTIAL | P | P | P | B | P1 | — | Live dimension scores (WS I) |
| Live risk engine jobs | SCAFFOLD_ONLY | S | N | N | N | P2 | Jobs | Request-path live; jobs deferred |

---

## Vehicles

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Vehicle list/detail | PARTIAL | P | P | P | B | P1 | — | Seed-backed + IA subnav (WS H) |
| Ownership / financing | PARTIAL | P | P | P | B | P1 | — | Leasing thin |
| Odometer / maintenance | PARTIAL | P | P | P | B | P1 | — | Odometer + maint costs UI (WS H) |
| Vehicle-linked transactions | PARTIAL | P | P | P | B | P1 | Txns | Fuel linked; txn vehicleId filter/update (WS H) |
| Cash / economic / TCO / mil | PARTIAL | P | P | C | B | P1 | Engine | Engine real on seed inputs |
| Valuation / equity | PARTIAL | P | P | P | B | P1 | Market | Live equity + mock ask (WS H) |
| Candidates / compare / market | PARTIAL | P | P | P | B | P1 | Market | Live keepVsReplace over mock listings (WS H) |
| Household fit | PARTIAL | P | P | P | B | P1 | — | Usage on detail/maintenance |
| Replacement / sell window | PARTIAL | P | P | P | B | P1 | Engine | Live sellWindowHint (WS H) |
| Vehicle scenarios | SCAFFOLD_ONLY | S | N | N | N | P2 | — | — |

---

## Documents

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Financial inbox list | PARTIAL | P | P | P | B | P1 | — | List + detail (WS J) |
| Object storage upload | PARTIAL | P | P | P | B | P1 | MinIO | S3 abstraction + local fallback (WS J) |
| Statuses / review flow | PARTIAL | P | P | P | B | P1 | — | PATCH transitions + UI (WS J) |
| Extraction model | PARTIAL | P | P | P | B | P2 | — | Runtime mock extract (WS J) |
| Entity linking | PARTIAL | P | P | P | B | P2 | — | vehicleId/accountId (WS J) |

---

## Connections

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Integrations list + health | PARTIAL | P | P | P | B | P1 | — | Live sources + computed freshness (WS K) |
| Fake sync | PARTIAL | P | P | P | B | P1 | — | Source-scoped + import batch (WS K) |
| Source CRUD | PARTIAL | P | P | P | B | P1 | — | Create/update/archive + reconnect (WS K) |
| Import batches / history | PARTIAL | P | P | P | B | P1 | — | Source-linked history + counts (WS K) |
| Raw records | PARTIAL | M | N | N | N | P2 | — | Seed + sync mock write |
| Duplicate prevention | SCAFFOLD_ONLY | S | N | N | N | P1 | Imports | Fingerprints partial |
| Connector metadata | PARTIAL | P | P | N | B | P2 | — | Mock provider catalog (WS K) |

---

## AI

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Deterministic tool registry | PARTIAL | P | P | P | B | P1 | Core metrics | Allowlisted registry + executor (WS L) |
| Advisor chat | PARTIAL | P | P | P | B | P2 | Tools | Tools-only chat API + UI (WS L) |
| Financial brief | PARTIAL | P | P | P | B | P1 | Tools | SEK-formatted tool prose (WS L) |
| Explainability / citations | PARTIAL | P | P | P | B | P1 | — | Citations + evidence hrefs (WS L) |
| No arbitrary DB | COMPLETE | C | — | P | — | P0 | — | Tools only |
| Safety boundaries | PARTIAL | P | P | P | B | P0 | — | Read-only allowlist; flag gate (WS L) |
| Feature flag gate | PARTIAL | P | P | P | B | P1 | Flags | AI flag enforced on advisor (WS L) |

---

## Cross-cutting

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Global search | PARTIAL | P | P | P | B | P1 | — | Cmd/Ctrl+K + GET /search (WS M) |
| Notification center | PARTIAL | P | P | P | B | P2 | — | List/mark-read (WS M) |
| Review queue | PARTIAL | P | P | P | B | P1 | Txns | Resolve actions + docs (WS M) |
| Reports / monthly / yearly | PARTIAL | P | P | P | B | P2 | Metrics | Monthly/yearly APIs + UI (WS M) |
| Quick actions | NOT_STARTED | N | N | N | N | P2 | — | — |
| Onboarding | PARTIAL | P | P | N | B | P1 | Auth | Wizard + register (WS M) |
| Demo mode / seed | PARTIAL | P | P | P | P | P1 | — | In-app demo load + seed (WS M) |
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
