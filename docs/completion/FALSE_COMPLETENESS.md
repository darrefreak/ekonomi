# False Completeness Findings

Audit date: 2026-08-07  
Branch inspected: `cursor/login-gate-9c58` (+ working tree for audit docs)  
Rule: do not trust “phase complete” / route exists / table exists as product completeness.

---

## A. Roadmap and phase reports over-claim

| Finding | Evidence | Reality |
|---|---|---|
| `docs/ROADMAP.md` says **“V1 roadmap status: COMPLETE”** | ROADMAP.md | Foundation/demo slice only — not product-complete vs master specification |
| Phase 1 claims “households/members/**permissions**” | ROADMAP / PHASE_1 | Membership check exists; role/privacy authorization does **not** |
| Phase 2 “reconciliation foundation” | ROADMAP / schema | `reconciliation_groups` table never written or read |
| Phase 5 “decision engines” | ROADMAP | Opportunities/risks/scenarios largely **seeded rows**, not live engines |
| Phase 5B “vehicle intelligence” | ROADMAP | Market analysis mostly **precomputed at seed**; UI is thin |
| Phase 6 “data intake” | ROADMAP | Read + fake sync only; no upload/workflow |
| Phase 7 “AI” | ROADMAP | Deterministic template brief — no chat, no LLM, flag ungated |
| Phase 8 “security review” | ROADMAP | Rate limit / helmet / privacy enforcement / logout still missing |
| Lint “passes” in phase reports | `package.json` scripts | Most packages run `echo 'lint ok'` — not real ESLint |

---

## B. Hardcoded INTERNAL financial numbers (not allowed as final V1)

External mock connectors are allowed. These are **internal** product numbers presented as calculated:

| Location | What’s hardcoded |
|---|---|
| `apps/api/src/dashboard/dashboard.service.ts` | `netWorthChangeMonth = 63_410_00`; forecast 30/60/90 = `18_400` / `9_800` / `-4_200`; upcoming bills/salary amounts; mortgage brief “9 800 kr/år” |
| `apps/api/src/net-worth/net-worth.service.ts` | `changeMonth`, fabricated prior NW, attribution breakdown |
| `packages/financial-engine/src/forecast.ts` | Mortgage saving opportunity fixed `9_800_00n` |
| Decisions seed / optimizer paths | Opportunity amounts often fixed in seed or constants |

Partial real path (for contrast): month income/spending/savings rate and account-position net worth **do** use engine helpers over seeded accounts/`financial_events`.

---

## C. Scaffold / placeholder UI presented as product surface

| Item | Evidence |
|---|---|
| `/investments`, `/assets`, `/debt` | `PagePlaceholder` — desktop nav still links them |
| `/more` | Placeholder — **breaks mobile IA** (primary overflow tab) |
| `/vehicles/[id]/maintenance` | Placeholder |
| `/vehicles/[id]/costs` | Redirect-only to detail |
| `/vehicles/market`, `candidates`, `compare`, `[id]/valuation`, `[id]/replacement` | Same thin `VehicleMarketPage` with title swaps; labeled “Mock market intelligence” |
| Global search | Header text “Sök med Ctrl/Cmd+K **(kommer snart)**” |
| Settings | Demo credentials + principles copy — not product settings (§109–110) |

---

## D. Schema / interfaces without runtime

| Artifact | Status |
|---|---|
| `transaction_splits` | Table only — zero inserts/reads |
| `reconciliation_groups` | Table only |
| `FinancialEventRevision` / `UserOverride` | Spec/ADR only — no tables |
| Metric registry (`MetricDefinition` / snapshots / `calculationVersion`) | Spec only |
| `personalDataPolicy` / household roles | Stored; never enforced in queries |
| `audit_logs` | Written only on household create |
| BullMQ job catalog (~25 types) | Only `HEALTH_CHECK` no-op |
| Feature flags | Listed via API; **not enforced** (AI flag seeded `false` but advisor still works) |
| Settings API | Hardcoded JSON; no persistence |
| Ledger postings in DB | Written by seed; **not** used to recompute balances/metrics |

---

## E. Fake / mock paths that look like product features

| Feature | Allowed external mock? | Internal reality |
|---|---|---|
| Integrations fake sync | Yes (external) | Inserts fake COMPLETED sync — OK for connectors, not a real sync pipeline |
| Documents inbox | OCR mock OK | No upload, statuses workflow, linking UI |
| Opportunities / risk / scenarios | — | Mostly seed table reads |
| Vehicle market intel | Marketplace feed mock OK | Analytical pipeline largely seed-time; request path is read |
| Account balances | — | Seeded cache; not ledger-derived |
| Balance snapshots | — | Ending balances copied into all snapshot fields |

---

## F. Dead / unused / bypass patterns

| Finding | Detail |
|---|---|
| `@tanstack/react-query` dependency | Installed; **zero** usage — manual `useEffect` fetch everywhere |
| Lucide dependency | Installed; never imported |
| Master stack missing | No shadcn, RHF, Recharts, TanStack Table, date-fns |
| API client gaps | No `refresh`, feature-flags, settings, advisor outcomes |
| Frontend unused client methods | `register`, `createHousehold`, `health`, `getCoverage` |
| ESLint config package | Placeholder |
| `apps/mobile` | README reserved only |
| Empty click handlers | None found (good) |
| Swallowing catch in session (historical) | Auto-register removed by login-gate; remaining pages still thin error UX |

---

## G. Quality gates that look green but are weak

| Gate | Result (2026-08-07) | Caveat |
|---|---|---|
| `pnpm build` | Pass | OK |
| `pnpm typecheck` | Pass | OK for TS packages |
| `pnpm lint` | Pass | Mostly echo stubs |
| `pnpm test` | Pass | ~20 engine unit tests + 2 API tests; web/api-client “no tests yet” |
| Docker compose | Healthy | web/api/worker/postgres/redis/minio/mailpit up |
| `/health` + `/health/ready` | OK | Postgres + Redis ready |

---

## H. Consistency false positives

Same concept can disagree because some screens use engine aggregates and others use hardcoded assemblies:

- Dashboard NW change vs Net Worth page attribution
- Dashboard forecast vs Forecast page seeded runs
- AI brief vs dashboard brief (different generators)

No shared metric registry / `calculationVersion` / `inputHash` enforcement.
