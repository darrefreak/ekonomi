# Workstream N Report — Privacy & security

**Date:** 2026-08-07  
**Branch:** `cursor/workstream-n-privacy-security-9c58`  
**PR:** https://github.com/darrefreak/ekonomi/pull/27  
**Status:** COMPLETE

---

## Completed requirements

1. **Roles** — `requireCanWrite` / `requireAdmin` on mutations; VIEWER/CHILD cannot write  
2. **Aggregate-only** — personal account/transaction/search projection via owner `personalDataPolicy`  
3. **Logout / revoke** — `POST /api/v1/auth/logout`, `revoke-all`; web logout revokes refresh then clears session  
4. **Rate limit** — Nest Throttler (global) + tighter limits on auth routes  
5. **Headers** — Helmet enabled in API bootstrap  
6. **Audit** — global `AuditService` (household create, policy update, logout, privacy ops)  
7. **Export / delete foundation** — `privacy_requests` + export/delete-request APIs + Settings UI  
8. **Authz tests** — real DB tests (not mocked access) in `privacy-security.test.ts`  
9. **Secrets** — `requireAccessSecret()` fail-closed in production  

Also addresses **P0-3**, **P0-4**, and baseline of **P0-5**.

---

## Remaining / deferred

- Auto refresh-token wiring in api-client interceptors  
- Broader Zod validation on every route (O)  
- CHILD-specific UX limits beyond write-deny  
- Async fulfillment workers for delete/leave  
- Invite / membership management UI  

---

## Schema / API / UI

| Area | Change |
|---|---|
| Migration | `0016_workstream_n_privacy_security.sql` (`privacy_requests`) |
| Modules | `audit`, `privacy`; expanded access/auth/settings/accounts/transactions |
| UI | Settings: editable policies, export/delete, logout revoke |

---

## Gate results

| Gate | Result | Notes |
|---|---|---|
| `pnpm db:migrate` | ✅ | `0016_workstream_n_privacy_security` |
| `pnpm db:seed` | ✅ | Demo household intact |
| `pnpm build` | ✅ | |
| `pnpm typecheck` | ✅ | |
| `pnpm lint` | ✅ | Echo stubs (real lint deferred to O) |
| `pnpm test` | ✅ | Includes `privacy-security.test.ts` |

---

## STOP

Workstream N complete.  
Do **not** auto-start O. Await: `START WORKSTREAM O`
