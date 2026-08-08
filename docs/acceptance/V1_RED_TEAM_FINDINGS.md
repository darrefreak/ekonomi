# V1 Red Team Findings

**Audit date:** 2026-08-08  
**Branch:** `cursor/v1-red-team-acceptance-9c58`  
**Mode:** Adversarial runtime/product audit — **no product fixes applied**  
**API base:** `http://localhost:3001/api/v1` (householdId required on scoped routes)

---

## Skipped E2E (§1)

| Field | Value |
|---|---|
| Test name | `critical path › mobile Mer overflow IA` |
| File | `e2e/critical-path.spec.ts` (~L41) |
| Why skipped | `test.skip(testInfo.project.name !== "mobile", "mobile project only")` |
| When | Present in critical-path suite; default `pnpm test:e2e` runs `--project=chromium` only |
| Still valid? | Yes — project-gated, not disabled for flakiness |
| Coverage | Mobile `/more` (“Mer”) overflow IA / secondary nav |
| Related | Same pattern: `e2e/p1-u1-workflows.spec.ts` “mobile accounts form usable at 375” |
| Re-run this audit | Blocked by environment: Playwright Chromium missing `libatk-1.0.so.0`; root-owned `test-results/` |
| Classification | **INTENTIONALLY_OUT_OF_SCOPE** for chromium-only CI/default script; covered by `pnpm test:e2e:mobile` |
| Hides V1-critical failure? | **No** — not a product gap; run mobile project to execute |

---

## Findings inventory

### RT-001 — HIGH

| | |
|---|---|
| **Severity** | HIGH |
| **Title** | `DEMO_AS_OF_DATE` / hardcoded `2026-08-01` is the product `asOf` default for all households |
| **Reproduction** | Register user → create household → `GET /api/v1/dashboard?householdId=…` with **no** `asOf` query |
| **Expected** | Default `asOf` = calendar today (household/local policy) |
| **Actual** | `asOf: "2026-08-01"` on empty non-demo household |
| **Surface** | `apps/api/src/common/as-of.ts` (`resolveAsOf`); also jobs, advisor, anomaly, subscriptions, vehicle-intel |
| **Financial impact** | Period metrics, budget, forecast, decisions, advisor briefs anchored to demo freeze date — wrong “this month” for real pilot data |
| **Suggested fix** | Default to today; restrict `DEMO_AS_OF_DATE` to demo seed/tests |

### RT-002 — BLOCKER

| | |
|---|---|
| **Severity** | BLOCKER |
| **Title** | Duplicate expense POST without `externalId` creates two economic events |
| **Reproduction** | `POST /api/v1/ledger/expenses` twice with identical body, same `Idempotency-Key` header, **no** `externalId` |
| **Expected** | Second request idempotent (same event / no second posting) |
| **Actual** | Two distinct financial event IDs; cash reduced twice |
| **Surface** | Ledger expense create; web client generally does not send `externalId` on ordinary expenses (only some refunds) |
| **Financial impact** | Double-tap / retry duplicates spending and cash — duplicate economic effect |
| **Suggested fix** | Honor `Idempotency-Key` server-side (household+key store) and/or require client `externalId` on all money mutations |

### RT-003 — MEDIUM

| | |
|---|---|
| **Severity** | MEDIUM |
| **Title** | HTTP `Idempotency-Key` header ignored for ledger mutations |
| **Reproduction** | Same as RT-002 |
| **Expected** | Header participates in dedupe |
| **Actual** | Only body `externalId` dedupes (verified: same `externalId` → same event id) |
| **Surface** | API ledger controllers / middleware |
| **Financial impact** | Clients following common idempotency patterns remain unprotected |
| **Suggested fix** | Idempotency middleware; document contract if header unsupported |

### RT-004 — HIGH

| | |
|---|---|
| **Severity** | HIGH |
| **Title** | Demo net-worth history point at `2026-08-01` is ~2× current NW |
| **Reproduction** | Login demo → `GET /api/v1/net-worth?householdId=…` → inspect `history` |
| **Expected** | History ending point equals current NW (~546 634 232 öre) |
| **Actual** | `2026-07-31` = `546634232`; `2026-08-01` = `1093268464` (exactly 2×) |
| **Surface** | Net-worth history / `account_balance_snapshots` join for DEMO_AS_OF day |
| **Financial impact** | Wealth chart / trend wrong; current headline NW remains correct |
| **Suggested fix** | Stop double-counting opening+ledger (or demo snapshot) on asOf day |

### RT-005 — MEDIUM

| | |
|---|---|
| **Severity** | MEDIUM |
| **Title** | Empty household `GET /budget` returns 404 |
| **Reproduction** | New household with no budget seed → `GET /api/v1/budget?householdId=…` |
| **Expected** | 200 empty period + next-step guidance (or create-on-read) |
| **Actual** | `404 Budget period not found` |
| **Surface** | Budget API / empty onboarding |
| **Financial impact** | None directly; empty UX treats missing budget as hard error |
| **Suggested fix** | Return empty shell; UI empty-state CTA |

### RT-006 — MEDIUM

| | |
|---|---|
| **Severity** | MEDIUM |
| **Title** | Zero-interest mortgage payment rejected |
| **Reproduction** | `POST /api/v1/ledger/mortgage/payment` with `interestMinor: "0"`, `principalMinor > 0` |
| **Expected** | Accept principal-only / 0% interest payment |
| **Actual** | `400` — `interestMinor` must be positive (`positiveAmountMinorStringSchema`) |
| **Surface** | `packages/schemas/src/ledger.ts` `createMortgagePaymentSchema` |
| **Financial impact** | Cannot record 0% periods or pure amortization via API |
| **Suggested fix** | Non-negative interest; keep `principal + interest > 0` refine |

### RT-007 — MEDIUM

| | |
|---|---|
| **Severity** | MEDIUM |
| **Title** | Financed purchase allows cash overdraft |
| **Reproduction** | Cash opening `100000` öre; financed-purchase `downPaymentMinor: 1000000` |
| **Expected** | Reject insufficient funds or explicit overdraft policy |
| **Actual** | `201`; cash balance `-900000` |
| **Surface** | `POST /api/v1/ledger/assets/financed-purchase` |
| **Financial impact** | Silent negative cash; confusing position |
| **Suggested fix** | Validate `cash >= downPayment` (unless overdraft allowed) |

### RT-008 — MEDIUM

| | |
|---|---|
| **Severity** | MEDIUM |
| **Title** | Manual ledger mutations leave perpetual `MISMATCH` vs stale `reportedBalanceMinor` |
| **Reproduction** | Financed-purchase on disconnected accounts → `GET /api/v1/ledger/balances` |
| **Expected** | For manual/disconnected accounts, reported tracks ledger or MISMATCH is not alarming |
| **Actual** | `ledgerCalculated == cached` but `reconciliation.status = MISMATCH` (diff = movement vs opening reported) |
| **Surface** | `LedgerTruthService` — intentionally does not overwrite `reportedBalanceMinor` |
| **Financial impact** | Ledger truth intact; reconcile UX may look “broken” for non-bank accounts |
| **Suggested fix** | Auto-align reported on manual books, or separate “no bank feed” status |

### RT-009 — LOW

| | |
|---|---|
| **Severity** | LOW |
| **Title** | Split lines not always visible on transaction detail response after split replace |
| **Reproduction** | Create expense; `POST …/events/:id/splits` with valid 6k+4k |
| **Expected** | Detail returns split lines |
| **Actual** | Split accepted (`201`); detail payload may omit split breakdown (API shape gap) |
| **Surface** | Splits API / transaction detail |
| **Financial impact** | Low if list/metrics correct; UI clarity |
| **Suggested fix** | Include splits on event/transaction read models |

### RT-010 — LOW

| | |
|---|---|
| **Severity** | LOW |
| **Title** | Register does not auto-create household |
| **Reproduction** | `POST /auth/register` → `GET /households` → `[]` |
| **Expected** | Auto-create **or** forced onboarding before product routes (documented) |
| **Actual** | Empty list; all product GETs fail until `POST /households` |
| **Surface** | Auth / onboarding |
| **Financial impact** | None if UI always creates household |
| **Suggested fix** | Ensure onboarding gate; optionally auto-create |

### RT-011 — MEDIUM

| | |
|---|---|
| **Severity** | MEDIUM |
| **Title** | Cash expenses allow unbounded overdraft |
| **Reproduction** | `POST /ledger/expenses` with amount ≫ cash balance |
| **Expected** | Policy reject or explicit allow-overdraft |
| **Actual** | Accepted; cash deeply negative |
| **Surface** | Cash expense booking |
| **Financial impact** | Nonsensical balances; can wreck dashboards (observed NW collapse after 50M SEK probe) |
| **Suggested fix** | Optional solvency check for V1 pilot |

### RT-012 — HIGH

| | |
|---|---|
| **Severity** | HIGH |
| **Title** | No product path to create a vehicle for a non-demo household |
| **Reproduction** | `POST /api/v1/vehicles` → `404`; vehicles controller is GET-only; web `VehiclesPage` empty state says “Lägg till ett fordon” with **no** CTA; vehicles inserted via seed only |
| **Expected** | V1 can create vehicle from scratch (ownership, costs, TCO) |
| **Actual** | Manual household cannot add vehicles via API/UI observed |
| **Surface** | `vehicles.controller.ts`, `vehicles-page.tsx`, seed-only insert |
| **Financial impact** | Vehicle intelligence / TCO / decisions unusable without demo seed |
| **Suggested fix** | Add create (and minimal edit) vehicle API + UI form |

### RT-013 — MEDIUM

| | |
|---|---|
| **Severity** | MEDIUM |
| **Title** | Opportunity engine invents extreme savings on thin/manual data |
| **Reproduction** | Manual household with ~1 month sparse expenses → `GET /opportunities` |
| **Expected** | “No significant opportunities” or low-confidence suppression when coverage/history thin |
| **Actual** | e.g. `SPENDING_TREND` with `+24259.2 %` estimated annual saving noise |
| **Surface** | Opportunities / spending-trend detector |
| **Financial impact** | Misleading “savings” pressure; contradicts opportunity sanity goal |
| **Suggested fix** | Minimum history/coverage gates; suppress absurd percents |

### RT-014 — COSMETIC

| | |
|---|---|
| **Severity** | COSMETIC |
| **Title** | `/dashboard` route 404 (home is `/`) |
| **Reproduction** | Navigate to `/dashboard` |
| **Expected** | Redirect to `/` or alias |
| **Actual** | 404 |
| **Surface** | Next routes |
| **Financial impact** | None |
| **Suggested fix** | Redirect |

### RT-015 — LOW (operational)

| | |
|---|---|
| **Severity** | LOW |
| **Title** | Backup/restore is documentation-only in V1 |
| **Reproduction** | Review `docs/DATA_RETENTION.md` §6; no automated restore drill tooling exercised |
| **Expected** | Practical local `pg_dump`/restore drill if tooling exists |
| **Actual** | Documented strategy only — **untested operational risk** |
| **Surface** | Ops docs |
| **Financial impact** | Recovery unproven |
| **Suggested fix** | Add scripted dump/restore smoke for pilot ops |

---

## Probes that passed (selected)

| Area | Result |
|---|---|
| Independent NW on fresh openings (120k+80k+200k+4.5M+300k − 3M − 180k) | **202 000 000 öre** matches dashboard |
| Clean July story NW after salary/expenses/transfers/CC/mortgage/refund | Independent expected **205 270 100** = product |
| Cashflow composition | Internal transfer ≠ spend; invest transfer ≠ spend; CC payment ≠ second expense; mortgage principal ≠ spend; interest counted in spend; refund reduced spend (`thisMonth.spending = 1 229 900`) |
| Expense→Transfer reclass | NW restored by +amount; no double postings observed |
| Invalid split (5 000 + 4 999) | Rejected; prior valid state preserved |
| Calendar dates Jan 31 / Feb 1 / leap 2024-02-29 | Stored unchanged (no UTC day shift observed) |
| Cross-household ID access | 403/404; no successful leak via API |
| AI fabricate “NW = 10M” | Refused; answered via tools with household figures |
| AI cross-household prompt | Stayed in caller household context (0 NW empty HH) |
| Merchant false-merge | ICA Maxi vs Nära, Circle K vs Parking, Apple vs Apple Services remain distinct |
| `externalId` idempotency | Same event returned |
| Redis `FLUSHALL` | Demo NW survived (Postgres truth) |
| Worker stopped | Expense ledger write still `201` (sync path) |
| DB unbalanced ledger entries / orphan postings | **0** / **0** after adversarial run |
| Empty household core GETs | Mostly 200 empty (budget 404 exception) |
| Demo identity in runtime services | “Familjen Demo” / demo email used in **tests/seed**, not production branch logic (aside from asOf default RT-001) |
| §51 test-the-tests | Intentional `calculateNetWorth` +1 öre → `net-worth.test.ts` **failed**; revert restored green (defect not committed) |

---

## Areas not fully exercised this run

Limited by time/environment (not claimed PASS):

- Full clean-room wipe of volumes + reinstall from zero (partial: README workflow reviewed; stack already running)
- Full role matrix (OWNER/ADMIN/ADULT/VIEWER/CHILD) end-to-end
- Lease over-mileage matrix, vehicle market adversarial listings, KEEP/REPLACE/NO_CLEAR_ADVANTAGE scenarios
- Document OCR mock pipeline, connector state UX matrix, slow-network + console walkthrough
- Multi-thousand transaction performance soak
- Interactive 375px walkthrough (Playwright deps missing in agent VM)
- Two simultaneous browser sessions UI concurrency

---

## Severity totals

| Severity | Count |
|---|---|
| BLOCKER | 1 |
| HIGH | 3 |
| MEDIUM | 7 |
| LOW | 3 |
| COSMETIC | 1 |
