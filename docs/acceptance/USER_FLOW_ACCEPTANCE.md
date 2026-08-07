# User Flow Acceptance

**Audit date:** 2026-08-07  
Method: API probes + Playwright critical path + code review of handlers. Interactive browser completion of every flow was not fully re-run for all domains.

| Flow | Result | Evidence / gaps |
|---|---|---|
| Login | PASS | E2E + API login |
| Logout | PASS | E2E revokes + clears |
| Session restore | PARTIAL | localStorage tokens; refresh not auto client-wired |
| Expired/revoked refresh | PASS (API) | Authz test rejects revoked refresh |
| View accounts / open / balances / txns | PASS | API + E2E accounts |
| Txn filter/search/open | PASS | UI + API |
| Txn edit category + persist | PASS (code/API) | `TransactionsService.update` + UI; not in Playwright suite |
| Budget view/edit/actuals | PASS (API/UI) | Mutations gated |
| Goals create/contribute/progress | PASS (API/UI) | `updateGoal` client unused |
| Vehicles costs/TCO/valuation/compare/replace | PARTIAL | Live math over seeded/mock inputs; depreciation ledger missing |
| Review resolve | PASS (API/tests) | product-ops tests |
| Integrations fake sync / history / auth-required | PASS | Allowed mock |
| AI question → tools → evidence | PARTIAL | Tools-only, flag gated; not LLM; depends on upstream metrics cache |

---

## Authentication notes

- Access JWT short TTL; refresh rotation exists.
- Client does not silently refresh on 401 across all calls (gap).
