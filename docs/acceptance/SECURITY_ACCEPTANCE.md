# Security Acceptance

**Audit date:** 2026-08-07

| Control | Result | Evidence |
|---|---|---|
| Household scoping | PASS | `requireMembership` on services; foreign household probe → 404 |
| Member permissions (write) | PASS | `requireCanWrite` / `requireAdmin`; VIEWER denied in tests |
| Personal-account visibility | PASS | Policy projection on accounts/txns/search |
| Aggregate-only access | PASS | AGGREGATES_ONLY omits personal txn lines / redacts accounts |
| IDOR cross-household | PASS | No exploit found; authz test + API probe |
| Auth token lifecycle | PASS | Login/refresh rotation/logout/revoke-all |
| Token revocation | PASS | Refresh row `revokedAt`; refresh fails after logout |
| Rate limiting | PASS | Global Throttler + tighter auth limits |
| Input validation | PARTIAL | Zod on many POSTs; query `householdId` often unchecked shape |
| Secure headers | PASS | Helmet in `main.ts` |
| Audit logging | PARTIAL | Policy/logout/privacy/household create |
| Sensitive logging | PASS | Structured logger; no password logs observed |
| Secrets fail-closed | PASS | `requireAccessSecret()` production |
| Object/document access | PARTIAL | Household-scoped document APIs; MinIO paths household-prefixed (assumed from intake design) |
| AI tool authorization | PARTIAL | Membership + AI flag; tools use viewer household context |

**Cross-household data exposure:** none demonstrated → not a FAIL.

**Security gate:** **PASS** with residual validation/breadth items (not P0 isolation failures).

---

## Accessibility (acceptance §10) — brief

| Check | Result |
|---|---|
| Keyboard / focus-visible | PASS patterns + CSS |
| Labels on critical forms | PASS (login; accounts create fixed in O) |
| Contrast muted text | PASS (token darkened) |
| axe serious/critical on login/dash/accounts | PASS (E2E) |
| Modal focus trap / full WCAG | PARTIAL / not certified |
| Chart text alternatives | PARTIAL |

No a11y P0 blockers recorded; not a full WCAG audit.
