# Workstream L Report — AI Advisor

**Date:** 2026-08-07  
**Branch:** `cursor/workstream-l-ai-advisor-9c58`  
**Status:** COMPLETE

---

## Completed requirements

1. **Chat + brief**
   - `POST /api/v1/advisor/chat` tools-only replies
   - Existing brief path refactored through tool registry
   - Advisor UI: chat panel + brief sections + outcomes

2. **Tools only**
   - Allowlisted registry (`ai-tool-registry.ts`): budget, opportunities, risk, vehicle equity, net worth
   - All tools `readOnly: true`; unknown tools rejected
   - Prose composed only from tool outputs (`explainFromTools` / `answerFromTools`)

3. **Flag gated**
   - `FeatureFlagsService.requireEnabled("AI")` on all advisor endpoints
   - Env override `FFOS_FEATURE_AI`
   - UI empty state when AI disabled; seed enables AI for demo

4. **No invented numbers**
   - Amounts formatted from tool minor units via `formatMoney`
   - Tests assert no “minor units” prose and chat uses tool data only

5. **Citations**
   - Brief/chat sections include citations with labels, values, and evidence `href`s
   - UI renders citation links

---

## Remaining / deferred

- LLM-backed chat (optional; V1 is deterministic tools-only)
- Persistent chat history table
- Unique constraint on recommendation outcomes
- Align dashboard brief generator with AI brief tool facts

---

## Schema / API / UI

| Area | Change |
|---|---|
| Flags | `FeatureFlagsService` + controller |
| Tools | `ai-tool-registry.ts`, improved `ai-tools.ts` |
| API | `POST /advisor/chat`; brief via registry |
| Schemas | chat request/response, citations, feature flags |
| UI | `/advisor` chat + citations + flag empty state |
| Seed | `AI` enabled (upsert) for demo |

---

## Gate results

| Gate | Result | Notes |
|---|---|---|
| `pnpm db:migrate` | ✅ | No new migration required |
| `pnpm db:seed` | ✅ | AI flag enabled |
| `pnpm build` | ✅ | |
| `pnpm typecheck` | ✅ | |
| `pnpm lint` | ✅ | Echo stubs (real lint deferred to O) |
| `pnpm test` | ✅ | ai-tools + advisor.service (flag gate + chat) |

---

## STOP

Workstream L complete.  
Do **not** auto-start M. Await: `START WORKSTREAM M`
