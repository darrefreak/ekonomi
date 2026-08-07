# Workstream K Report — Integrations & Imports

**Date:** 2026-08-07  
**Branch:** `cursor/workstream-k-integrations-9c58`  
**Status:** COMPLETE

---

## Completed requirements

1. **Source CRUD**
   - `POST /api/v1/sources`, `PATCH /api/v1/sources/:id`, `DELETE /api/v1/sources/:id` (soft archive)
   - Mock provider catalog for create defaults
   - Integrations UI: add / sync / disconnect

2. **Reconnect UX**
   - `POST /api/v1/sources/:id/reconnect` for `AUTH_REQUIRED|ERROR|DISCONNECTED|DEGRADED`
   - Seed SBAB source in `AUTH_REQUIRED` with reconnect CTA
   - Source-scoped `POST /api/v1/sources/:id/sync`

3. **Import history**
   - Batches expose `sourceId` / `sourceName` and full counts
   - Fake sync creates `import_batches` + mock `raw_import_records`
   - Seed includes COMPLETED / PARTIAL history across SEB / SBAB / Avanza

4. **Coverage / freshness honest**
   - `computeFreshnessLabel` / `summarizeFreshness` from `lastSyncedAt` + status
   - Dashboard header uses summary (auth / stale / age)
   - Per-source freshness on coverage widget; CSN detected from accounts/sources

---

## Remaining / deferred

- Real open banking / BankID (out of V1)
- Multipart CSV file import pipeline
- Duplicate fingerprint enforcement beyond unique hash index
- Jobs-driven sync scheduling

---

## Schema / API / UI

| Area | Change |
|---|---|
| Migration | `0014_workstream_k_integrations.sql` (`archived_at`) |
| Engine | `freshness.ts` |
| API | sources CRUD + reconnect/sync; richer imports |
| UI | `/integrations`, `/imports`, dashboard coverage freshness |
| Seed | SEB / SBAB / Avanza / Kivra + mixed batches |

---

## Gate results

| Gate | Result | Notes |
|---|---|---|
| `pnpm db:migrate` | ✅ | Applied `0014_workstream_k_integrations` |
| `pnpm db:seed` | ✅ | Multi-source demo + import history |
| `pnpm build` | ✅ | |
| `pnpm typecheck` | ✅ | |
| `pnpm lint` | ✅ | Echo stubs (real lint deferred to O) |
| `pnpm test` | ✅ | Freshness unit + intake integrations mutation tests |

---

## STOP

Workstream K complete.  
Do **not** auto-start L. Await: `START WORKSTREAM L`
