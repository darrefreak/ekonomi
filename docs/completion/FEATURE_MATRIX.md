# Feature Completion Matrix

Audit date: 2026-08-08 (P1-U5 update)  
Statuses: COMPLETE | PARTIAL | SCAFFOLD_ONLY | MOCK_ONLY | NOT_STARTED | BROKEN | BLOCKED  

Columns: Status · Backend · Frontend · Tests · Mobile · Priority · Dependencies · Notes

Legend for layer columns: **C** complete · **P** partial · **S** scaffold · **M** mock · **N** none · **B** broken

---

## Foundation

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Authentication (login/register/JWT) | COMPLETE | C | C | P | P | P0 | — | Refresh-on-401 wired (P1-U2); logout/revoke-all present |
| Household creation | COMPLETE | C | C | P | P | P1 | Auth | Onboarding + settings rename (P1-U1) |
| Household membership | COMPLETE | C | C | C | P | P0 | Auth | Invite/accept/role/remove + last-OWNER (P1-U1) |
| Permissions / roles | COMPLETE | C | C | C | P | P0 | Members | Role change UI + authz tests (P1-U1) |
| Member privacy policies | COMPLETE | C | C | C | P | P0 | Permissions | Human-readable policy labels in settings (P1-U1) |
| Audit logging | PARTIAL | C | P | P | N | P1 | Auth | List API + Settings UI for OWNER/ADMIN (P1-U5); before/after detail deferred |
| Settings (product) | COMPLETE | C | C | P | P | P1 | — | Full V1 sections + policies/categories/members (P1-U1) |
| Localization sv-SE | PARTIAL | P | P | P | P | P2 | — | Swedish copy; en-US not wired |
| Appearance / dark mode | PARTIAL | C | C | P | P | P2 | Tokens | Settings appearance applied via `.dark` (P1-U3); polish residual |
| Feature flags | SCAFFOLD_ONLY | S | N | N | N | P2 | — | Not enforced |

---

## Money

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Accounts list/detail | COMPLETE | C | C | C | P | P1 | Core | CRUD + opening balance + ownership (P1-U1); ledger-aligned |
| Account balances (cache) | COMPLETE | C | C | C | P | P0 | Ledger | Cache derived; list/detail ledger-aligned (R2/U1) |
| Balance snapshots | PARTIAL | P | P | P | N | P0 | Ledger | Opening + NW history; not all sources |
| Source transactions | COMPLETE | C | C | P | P | P1 | — | Browse/edit classify/exclude (P1-U1) |
| Financial events | COMPLETE | C | C | C | P | P0 | — | Runtime income/expense/transfer/refund HTTP + UI (P1-U1) |
| Ledger entries/postings | COMPLETE | C | N | C | N | P0 | Engine | Runtime persist via events (R1–R3/U1); no raw posting UI |
| Transaction splits | COMPLETE | C | C | P | P | P0 | Events | replaceEventSplits + split editor (P1-U1) |
| Internal transfers | COMPLETE | C | C | C | P | P0 | Ledger | Product UX + copy (P1-U1) |
| Credit card handling | COMPLETE | C | C | C | P | P1 | Ledger | Purchase/payment product forms (P1-U2) |
| Mortgage handling | COMPLETE | C | C | C | P | P1 | Ledger | Mortgage payment form + splits (P1-U2) |
| Refunds / reimbursements | COMPLETE | C | C | C | P | P0 | Ledger | HTTP + UI (R3/U1) |
| Merchant normalization | PARTIAL | P | P | C | P | P2 | — | List `q` + alias search + searchable assign (P1-U3); import normalizer deferred |
| Categories | COMPLETE | C | C | C | P | P1 | — | User CRUD + archive (P1-U1) |
| Transaction editing | COMPLETE | C | C | P | P | P1 | Txns | Metadata + economic creates (P1-U1) |
| Transaction filtering/search | COMPLETE | C | C | P | P | P1 | — | Filters + search (P1-U1) |

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
| Opportunities on dashboard | PARTIAL | C | P | P | P | P2 | Opps | Deterministic opps + estimateBasis/facts (P1-U4) |
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
| Sinking funds | COMPLETE | C | C | P | P | P1 | Goals | Create/contribute/edit (P1-U2) |
| Goals | COMPLETE | C | C | P | P | P1 | — | Create/edit/status + progress (P1-U1) |
| Planned expenses | SCAFFOLD_ONLY | S | N | N | N | P2 | Forecast | — |
| Forecast horizons | PARTIAL | P | P | P | P | P0 | Core | Live 7d–12m engine (WS E); linear model |
| Forecast backtesting | PARTIAL | P | P | P | P | P2 | Forecast | Infra + lookback compare (WS E) |
| Scenarios | PARTIAL | P | P | P | P | P1 | Engine | Non-destructive simulate (WS E) |
| Available to invest | COMPLETE | C | C | C | P | P1 | Policies | Policy math + dashboard (P1-U2); not advice |

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
| Savings opportunities | PARTIAL | C | C | C | P | P1 | Core | Deterministic detectors + evidence/facts (P1-U4); more types deferred |
| Subscription analysis | PARTIAL | C | P | C | P | P1 | Subs | Price-increase series + recurring confirm/dismiss (P1-U5) |
| Contract renewal intel | PARTIAL | C | P | C | P | P1 | Contracts | Deadline review; no fake savings (P1-U4) |
| Lifestyle creep | PARTIAL | C | P | C | P | P2 | Cashflow | Spending-trend opportunity (P1-U4) |
| Anomaly detection | PARTIAL | C | P | C | N | P1 | Review | List/dismiss API + Insights/Review UI (P1-U5); no ML |
| Recommendation outcomes | PARTIAL | P | P | P | B | P2 | AI | List + status actions (WS I) |

---

## Risk

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Risk dimensions (liquidity/debt/…) | PARTIAL | P | P | P | B | P1 | Core | Live scores + evidence (WS I) |
| Financial health | PARTIAL | P | P | P | B | P1 | — | Live dimension scores (WS I) |
| Live risk engine jobs | PARTIAL | C | N | P | N | P2 | Jobs | RUN_RISK_ANALYSIS job + request-path (P1-U4) |

---

## Vehicles

| Feature | Status | BE | FE | Test | Mobile | Pri | Deps | Missing / defects |
|---|---|---|---|---|---|---|---|---|
| Vehicle list/detail | PARTIAL | P | P | P | B | P1 | — | Seed-backed + IA + purchase form + E2E (P1-U3) |
| Ownership / financing | PARTIAL | P | P | P | B | P1 | — | Financed seed/ledger coherent + cash/financed UX (P1-U3); leasing thin |
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
| Accessibility | PARTIAL | — | P | P | P | P2 | — | Skip link, focus; axe serious/critical on critical pages (WS O) |
| Responsive UX | PARTIAL | — | P | P | P | P1 | Mer | Desktop OK; Mer overflow IA + mobile E2E (WS O) |
| Error/empty/loading | PARTIAL | — | P | N | P | P1 | — | Retry mostly dashboard-only |
| Observability | PARTIAL | P | N | N | N | P2 | — | Structured logs + request IDs |
| Performance (dashboard) | PARTIAL | P | P | N | P | P1 | — | Aggregated dashboard API exists |
| Security baseline | PARTIAL | P | P | N | P | P0 | — | See P0_ISSUES |
| Jobs catalog | PARTIAL | C | P | C | N | P2 | Redis | analysis_runs persist + Settings status panel (P1-U5) |
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
| `pnpm lint` | Pass | Real ESLint via `@ffos/eslint-config` (WS O) |
| `pnpm typecheck` | Pass | |
| `pnpm test` | Pass | API + engine suite |
| `pnpm test:e2e` | Pass | Playwright critical path + axe (WS O) |
| Docker | Healthy | Ports 3000/3001 (alt 3100/3101) |
| Desktop UX | Partial | Core IA wired |
| Mobile ~375 | Partial | Mer overflow IA present (P0-6 addressed) |
