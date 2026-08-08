# V1 Red Team & Real Household Acceptance

**Date:** 2026-08-08  
**Scope:** Adversarial runtime/product audit (not a feature workstream)  
**Prior status:** V1 PRODUCT ACCEPTED (formal); this audit tries to break it like a real household  
**Evidence:** `docs/acceptance/V1_RED_TEAM_FINDINGS.md`  
**Fixes during audit:** None (defect inventory only)

---

## Verdict

# FAIL

V1 is **not** classified as ready for a real-data pilot until blockers/high pilot-safety defects are addressed.

This does **not** reopen formal product acceptance architecture. It means adversarial household use still surfaces critical correctness risks.

**Not equivalent to public production readiness** even if this were PASS — external integrations, monitoring, secrets, regulatory, and production backup remain separate (see §53 of audit brief).

---

## Why FAIL (summary)

1. **BLOCKER RT-002** — Duplicate expense without `externalId` double-posts (HTTP `Idempotency-Key` ignored). Web paths often omit `externalId` → real double-tap risk.
2. **HIGH RT-001** — Global `asOf` defaults to demo freeze `2026-08-01` for every household → period/decision/advisor time base wrong for pilot data.
3. **HIGH RT-004** — Demo NW history point on asOf day is **2×** current net worth (chart lie).
4. **HIGH RT-012** — No API/UI path to create a vehicle outside seed → vehicle real-household story blocked.

Clean-path ledger economics (independent NW + cashflow composition) largely held. Failures are concentrated in idempotency, asOf pollution, history, and vehicle create gap.

---

## Skipped E2E

| | |
|---|---|
| Test | `critical path › mobile Mer overflow IA` |
| File | `e2e/critical-path.spec.ts` |
| Reason | Skipped unless Playwright project `mobile` |
| Classification | **INTENTIONALLY_OUT_OF_SCOPE** for default `pnpm test:e2e` (chromium-only) |
| V1-critical hide? | No — use `pnpm test:e2e:mobile` |
| This environment | Could not re-execute (missing Chromium system libs) |

---

## Defect counts

| Severity | Count |
|---|---|
| Blockers | **1** |
| High | **3** |
| Medium | **7** |
| Low | **3** |
| Cosmetic | **1** |

---

## Area results

| Area | Result | Notes |
|---|---|---|
| Financial correctness | **FAIL** | Clean story NW/cashflow matched independent calc; blocked by RT-002 duplicate effect + RT-004 history 2× + RT-001 asOf |
| Data integrity | **PASS** | Unbalanced ledger entries = 0; orphan postings = 0 after destructive probes; Redis flush did not destroy PG truth |
| Household isolation | **PASS** | Cross-household ID access → 403/404; AI stayed in caller household |
| AI grounding | **PASS** | Refused “say NW is 10M”; used deterministic tools; citations present |
| Vehicle calculations | **FAIL** | Cannot create vehicle from scratch (RT-012); financed-purchase overdraft/reconcile UX issues |
| Mobile real-use | **FAIL** | Full interactive 375px adversarial walkthrough not completed this run (Playwright env limitation); prior formal mobile acceptance not re-proven here |

---

## Clean-room / empty / manual household (condensed)

| Check | Outcome |
|---|---|
| Documented quick start (`README`) | `pnpm install` → docker deps → migrate → seed → api/web — appears complete; no extra secret ritual beyond `.env.example` |
| Full volume wipe clean-room | Not re-executed destructively in this agent (stack already healthy) |
| Empty household | Most surfaces 200 empty; **budget 404** (RT-005); asOf polluted (RT-001) |
| Demo load | Dashboard populated; baseline NW `546634232` öre @ `2026-08-01` |
| Manual household from zero | Accounts/goals/ledger usable without demo IDs; **vehicles not creatable** |
| Independent NW (openings) | PASS |
| Independent NW + July story | PASS (`205270100`) |
| Cashflow rules | PASS (transfers/CC payment/principal/refund behavior) |
| Month/leap dates | PASS (no day shift observed) |
| Worker down / Redis flush | Ledger writes OK; financial truth in Postgres |
| Backup drill | **Untested** (docs-only) — operational risk RT-015 |
| Dependency audit | `npm audit` showed no critical/high vulnerability metadata in this run |
| Test-the-tests (§51) | PASS — intentional NW +1 öre failed unit test; reverted; not committed |

---

## Pilot readiness vs production

| Label | Status |
|---|---|
| READY FOR REAL DATA PILOT | **No** (FAIL) |
| READY FOR PUBLIC PRODUCTION | **No** (out of scope; remains separate) |

---

## Recommended unblockers (for a follow-up fix stream — not done here)

1. Server-side idempotency for money mutations (RT-002/003)  
2. `resolveAsOf` → today by default (RT-001)  
3. Fix NW history double-count on asOf (RT-004)  
4. Vehicle create API + UI (RT-012)  
5. Then re-run this red-team checklist before pilot

---

## Sign-off

| Field | Value |
|---|---|
| Red Team result | **FAIL** |
| Auditor | Cloud agent adversarial run |
| Fix commits in this PR | Documentation only |
