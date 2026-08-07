# Master Gap Analysis — Family Financial OS

**Audit date:** 2026-08-07  
**Source of truth:** Original MASTER SPECIFICATION (user prompt) + `docs/*` + ADRs + phase reports  
**Method:** Code inspection over documentation claims; Docker/runtime smoke; `pnpm build|lint|typecheck|test`  
**Implementation:** None in this workstream — audit documents only  

Related artifacts:

- [FEATURE_MATRIX.md](./FEATURE_MATRIX.md)
- [FALSE_COMPLETENESS.md](./FALSE_COMPLETENESS.md)
- [P0_ISSUES.md](./P0_ISSUES.md)
- [COMPLETION_PLAN.md](./COMPLETION_PLAN.md)

---

## 1. Executive verdict

The repository is a **substantial foundation and demo** of Family Financial OS.

It is **not** a product-complete application against the master specification.

| Completeness tier | Verdict |
|---|---|
| FOUNDATION COMPLETE | **Yes** — monorepo, Docker, auth basics, seeded household, many routes, engine packages |
| FEATURE COMPLETE | **No** — most domains are PARTIAL / MOCK_ONLY / SCAFFOLD |
| PRODUCT COMPLETE | **No** |

`docs/ROADMAP.md` “V1 roadmap status: COMPLETE” describes **phase delivery of a demo slice**, not master-spec product completion. Treat that label as outdated for the Product Completion Program.

---

## 2. What is genuinely complete (narrow sense)

These meet a high bar for their *scoped* purpose (not full product depth):

| Area | Why “complete enough” |
|---|---|
| Money type (`amountMinor: bigint`) | Domain + schemas + formatting + unit tests |
| Core ledger **builders** (transfer, CC, mortgage, income, expense) | Pure engine + unit tests matching ADR examples |
| Docker compose stack | web/api/worker/postgres/redis/minio/mailpit healthy |
| Health endpoints | `/health`, `/live`, `/ready` |
| Household membership gate | `requireMembership` on scoped APIs |
| Typed `packages/api-client` usage from web | No raw fetch bypass |
| Financial-engine purity | No Nest/React/DB deps |
| Deterministic demo seed (18–24 months story) | Accounts, events, vehicles, planning, intake seeds |
| Login gate (post login-gate PR) | Unauthenticated users redirected to `/login` |
| AI “no arbitrary DB” pattern | Tool functions only for brief |

---

## 3. What is scaffold / mock / partial (major)

### Financial core

- Balances and snapshots are **seed caches**, not ledger reconstructions.
- Dashboard forecast, NW change, upcoming obligations, parts of brief: **hardcoded**.
- `transaction_splits`, `reconciliation_groups`: schema only.
- Refunds/reimbursements: enums only.
- Metric registry / versioning: not implemented.
- Runtime ledger write API: not implemented (seed-only persistence).

### Product UI

- Read-only surfaces dominate (list/detail from seed).
- Placeholders: investments, assets, debt, more, vehicle maintenance.
- Vehicle market routes: title-swapped thin mock page.
- Settings/search/onboarding/quick actions/reports: missing or stub.
- Mobile bottom-nav **Mer** is a placeholder → IA broken on phone.

### Security & privacy

- Roles and privacy policies stored, not enforced.
- No rate limiting / helmet.
- No logout/revoke-all.
- Audit log almost unused.
- Feature flags not enforced (AI flag `false` but advisor works).

### Jobs & intake

- BullMQ: `HEALTH_CHECK` only.
- Documents/integrations/imports: seed + fake sync (external mock OK; workflow incomplete).
- MinIO running but unused for uploads.

### Declared frontend stack

- Missing: shadcn/Radix, RHF, Recharts, TanStack Table, date-fns usage.
- TanStack Query / Lucide installed but unused.

---

## 4. What is broken

| Issue | Severity |
|---|---|
| Mobile `/more` placeholder blocks navigation | P0 UX |
| AI feature flag not gating advisor | P1 product integrity |
| Internal hardcoded SEK figures presented as calculated | P0 correctness |
| Balances not tied to ledger postings | P0 integrity |
| Lint scripts always green via `echo` | Quality false signal |

No catastrophic Docker/runtime failure found at audit time: web `200`, API health/ready `ok`.

---

## 5. Requirement traceability (master → status)

Condensed map (see FEATURE_MATRIX for full rows). States per program definitions.

### Architecture & invariants

| Requirement | Status |
|---|---|
| Money as minor units / no float arithmetic | COMPLETE (core) |
| Ledger pipeline model in DB | PARTIAL |
| Engine-only financial math | PARTIAL (builders yes; product path hybrid) |
| Household-scoped queries | PARTIAL (membership yes; privacy no) |
| Derived metrics metadata | NOT_STARTED |
| Idempotent job catalog | SCAFFOLD_ONLY |

### Users / privacy / security

| Requirement | Status |
|---|---|
| User / Household / Member | PARTIAL |
| Roles OWNER…CHILD | SCAFFOLD_ONLY |
| Access policies FULL_DETAILS… | SCAFFOLD_ONLY |
| Audit log | SCAFFOLD_ONLY |
| Auth token model | PARTIAL |
| Rate limit / secure headers | NOT_STARTED |
| Passkeys / MFA | NOT_STARTED |

### Money & ledger examples

| Requirement | Status |
|---|---|
| Internal transfer semantics | PARTIAL (engine+seed) |
| Investment transfer | PARTIAL |
| Credit card purchase/payment | PARTIAL |
| Mortgage P+I | PARTIAL |
| Refunds | NOT_STARTED |
| Balance snapshots truthful | MOCK_ONLY |
| Reconciliation | SCAFFOLD_ONLY |

### Dashboard & metrics

| Requirement | Status |
|---|---|
| Aggregated dashboard API | PARTIAL |
| Position from data | PARTIAL |
| Month summary from events | PARTIAL |
| Forecast widget | MOCK_ONLY |
| Upcoming | MOCK_ONLY |
| Brief | PARTIAL |
| Metric registry | NOT_STARTED |

### Planning / wealth / optimize / risk

| Requirement | Status |
|---|---|
| Budget / subs / contracts / goals | PARTIAL |
| Sinking funds | PARTIAL |
| Forecast engine horizons | PARTIAL |
| Backtesting | SCAFFOLD_ONLY |
| Scenarios | MOCK_ONLY |
| Available to invest | SCAFFOLD_ONLY |
| Investments/assets/debt UI | SCAFFOLD_ONLY |
| Opportunities / risk live engines | MOCK_ONLY |
| Lifestyle creep | NOT_STARTED |
| Anomaly engine | SCAFFOLD_ONLY |

### Vehicles

| Requirement | Status |
|---|---|
| Vehicle domain + TCO engine | PARTIAL |
| Market intel pipeline | MOCK_ONLY / PARTIAL |
| Full vehicle UI IA | SCAFFOLD_ONLY / MOCK_ONLY |
| Transaction↔vehicle linking | SCAFFOLD_ONLY |

### Documents / connections / AI

| Requirement | Status |
|---|---|
| Inbox + mock docs | MOCK_ONLY |
| Upload / MinIO workflow | NOT_STARTED |
| Fake sync + health UI | MOCK_ONLY (allowed) |
| Real connectors | BLOCKED (out of V1) |
| AI tools + brief | PARTIAL |
| AI chat | NOT_STARTED |

### Cross-cutting product ops

| Requirement | Status |
|---|---|
| Global search | NOT_STARTED |
| Notifications | NOT_STARTED |
| Reports / monthly / yearly | NOT_STARTED |
| Onboarding | NOT_STARTED |
| Quick actions | NOT_STARTED |
| iOS app | NOT_STARTED |
| Dark mode | SCAFFOLD_ONLY |
| E2E tests | NOT_STARTED |

---

## 6. Layer audit summary

| Layer | Assessment |
|---|---|
| Database | Broad schema; several unused tables; FKs mostly OK |
| Domain | Strong money/enums; privacy not operationalized |
| Schemas | Solid for existing APIs; gaps for mutations |
| Financial engine | Real for core builders + some metrics; some hardcoded opportunity constants |
| Repositories | Thin Drizzle in services; little repository layering |
| Application services | Hybrid real aggregation + mock assemblies |
| API | Many GETs; few writes; validation incomplete |
| API client | Good coverage of GETs; missing refresh/flags/settings |
| Frontend | Many read UIs; placeholders; stack incomplete |
| Mobile UX | Shell exists; Mer broken; no Expo app |
| Tests | Engine unit good; API/web/E2E weak |
| Error/empty | Partial; retry sparse |
| Security | Membership yes; rest weak |
| Observability | Logs + request IDs; no error tracking product |
| Documentation | Phase docs over-claim completeness |

---

## 7. Data-flow verification (critical metrics)

Target path:

`DB → domain → financial-engine → service → API → api-client → UI`

| Metric | Actual path | Verdict |
|---|---|---|
| Net worth (level) | accounts.currentBalance → `calculateNetWorth` → dashboard/NW API → UI | PARTIAL — not from postings |
| NW change | Hardcoded in services | FAIL (MOCK internal) |
| Month income/spend | financial_events → cashflow helpers → API → UI | PASS (seed-dependent) |
| Savings rate | Engine on period totals | PASS |
| Dashboard forecast 30/60/90 | Hardcoded | FAIL |
| Cash runway | cash / monthly spend | PARTIAL |
| Budget remaining | planning engine vs seed budget | PARTIAL |
| Vehicle TCO | seed costs → engine → vehicles API → UI | PARTIAL (inputs seed; math real) |
| Opportunities ranking | Mostly seed / fixed constants | FAIL for live engine |
| AI brief numbers | Tools over services | PARTIAL — tools can wrap mock upstream |

---

## 8. Quality gates (executed)

| Command | Result | Notes |
|---|---|---|
| `pnpm build` | ✅ | |
| `pnpm lint` | ✅ | **False green** — echo stubs |
| `pnpm typecheck` | ✅ | |
| `pnpm test` | ✅ | ~20 engine + 2 API; web none |
| Docker compose | ✅ | Healthy; LAN ports 3100/3101 |
| API `/health/ready` | ✅ | postgres+redis ok |
| Desktop | ⚠ | Placeholders in nav |
| Mobile ~375×812 | ❌ | `/more` placeholder |

---

## 9. Gap counts by priority

Approximate from matrix + P0 list (distinct themes):

| Priority | Approx. count | Examples |
|---|---|---|
| **P0** | **8** tracked issues (+ ~15 matrix P0 rows) | Ledger truth, hardcoded metrics, privacy, logout, security headers/rate limit, mobile Mer, splits/refunds, metric consistency |
| **P1** | **~40** | Mutations, wealth pages, settings, search, review resolve, document workflow, live decisions, vehicle IA |
| **P2** | **~25** | Reports, notifications, lifestyle creep, backtesting depth, dark mode, real lint/E2E |
| **P3** | **~10** | iOS app, polish widgets, advanced portfolio |

---

## 10. Recommended first workstream

**WORKSTREAM A — FINANCIAL CORE CORRECTNESS**

Why first:

1. Master rule: no fake internal financial logic.
2. Multiple P0s are core correctness (ledger↔balances, hardcoded dashboard/NW, metric consistency, refunds/splits).
3. Every later workstream (dashboard, planning, risk, AI, vehicles economics) depends on trustworthy numbers.

Do **not** start UI polish or new speculative domains before A closes its P0s.

---

## 11. Stop condition

Audit deliverables created. **No feature implementation performed.**

Await explicit instruction:

`START WORKSTREAM A`
