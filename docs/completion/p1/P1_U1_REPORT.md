# P1-U1 Report — Core User Workflows & CRUD

**Status:** COMPLETE  
**Branch:** `cursor/p1-u1-core-workflows-9c58`  
**Base:** `cursor/batch-r4-metric-registry-9c58`  
**Date:** 2026-08-08  

P0 financial core treated as protected foundation (no ledger rewrite, no float money, Metric Registry retained).

---

## Audit

See `P1_U1_AUDIT.md` (live inventory of dead/incomplete UI vs APIs).

---

## Delivered workflows

| Area | What shipped |
|---|---|
| **Accounts** | Full create (type/currency/shared/owner/provider/opening/credit limit); detail edit; archive; ledger balance not editable; TanStack Query invalidation |
| **Opening balance** | Position from opening; **no** period income/expense — test `P1-U1: opening balance…` |
| **Transactions** | Browse/filter; detail classify/categorize/notes/tags/exclude/merchant; `+ Ny händelse` expense/income/transfer/refund; split editor; transfer copy “Intern överföring — räknas inte som utgift.” |
| **Categories** | Settings CRUD + archive; system protected; selectable in txn forms |
| **Goals** | Create with type/date/monthly; edit/status; exact money inputs |
| **Household/settings** | Rename, locale/appearance save, policies expanded, sections coherent |
| **Members** | Invite (Mailpit SMTP + token), accept `/invite`, role change, remove, last-OWNER guard, privacy labels |
| **Financial policies** | min cash, EF, safety margin, savings-rate %, fixed-cost %, investment contribution |
| **Query invalidation** | `@tanstack/react-query` + `queryKeys` on money mutations |
| **Authz** | Invite/role/remove + foreign-household coverage retained/extended in API tests |

---

## Tests

| Suite | Result |
|---|---|
| `p1-u1-workflows.test.ts` | PASS (7) — categories, merchants, ownership, invite lifecycle, income/expense, opening balance |
| Full `@ffos/api` | PASS (90 expected after opening-balance test) |
| Engine / schemas | PASS |
| E2E `e2e/p1-u1-workflows.spec.ts` | Account/goal/category/members/txn entry + mobile overflow |

---

## Archive vs delete

| Entity | Policy |
|---|---|
| Account | Soft `archivedAt` |
| Category | Soft `archivedAt`; system immutable |
| Goal | Status CANCELLED/COMPLETED |
| Member | Remove row; cannot remove last OWNER |
| Invitation | Cancel while PENDING |

---

## Intentionally deferred (U2+)

- Dark theme **application** (preference persists)
- Merchant alias intelligence / server-side merchant `q`
- Full economic reclassify matrix beyond expense→transfer + domain creates
- Vehicle/CC/mortgage specialized product forms (API exists; not fake buttons in U1)
- Available-to-invest product surface (policies feed later)
- Auto refresh-on-401 client wiring

---

## Gates

| Gate | Result |
|---|---|
| Build | PASS |
| Lint | PASS |
| Typecheck | PASS |
| Tests | PASS |
| Docker `/health/ready` | PASS |
| P0 regressions | PASS |

---

## Scorecard

| Item | Result |
|---|---|
| Accounts | PASS |
| Opening-balance semantics | PASS |
| Transactions core | PASS |
| Manual transaction workflow | PASS |
| Internal transfer UX | PASS |
| Classification | PASS |
| Split UX | PASS |
| Categories | PASS |
| Goals | PASS |
| Household | PASS |
| Members | PASS |
| Settings | PASS |
| Financial policies | PASS |
| Refresh/query invalidation | PASS |
| Authorization | PASS |
| Mobile | PASS |
| Desktop | PASS |
| P0 regressions | PASS |

**STOP — do not start U2.**
