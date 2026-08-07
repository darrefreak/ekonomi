# Workstream A Report — Financial Core Correctness

**Date:** 2026-08-07  
**Branch:** `cursor/workstream-a-financial-core-9c58`  
**Status:** COMPLETE for scoped A goals (see remaining)

---

## Completed requirements

1. **Ledger truth path**  
   - Engine: `reconstructBalances`, `postingBalanceDelta`, `findBalanceMismatches`  
   - Seed ending balances = opening + ledger postings (no illustrative overwrite)  
   - Snapshots store `ledgerCalculatedBalance` from reconstruction (`source: ledger_reconstruct`)

2. **Removed hardcoded dashboard / net-worth product numbers**  
   - NW change, forecast 30/60/90, upcoming, mortgage brief tip now derived  
   - Shared `HouseholdMetricsService.getFinancialSnapshot()` used by dashboard + net-worth

3. **Refunds foundation**  
   - `buildCashRefund` / `buildCashReimbursement`  
   - Seed refund event; `expenseAmountMinor` negative for netting  
   - Unit tests

4. **Splits / transfer integrity**  
   - Mortgage events write `transaction_splits` (interest + principal)  
   - Internal transfers write counterpart source tx + `reconciliation_groups`

5. **Metric consistency starter**  
   - Same snapshot for NW level + monthly change on dashboard and `/net-worth`  
   - Consistency unit tests  
   - Mortgage opportunity sizing uses `estimateMortgageRateSavingMinor` (10% of interest)

6. **Optimizer constant removed**  
   - `savingsOptimizerSuggestions` no longer hardcodes `9_800_00n`

---

## Remaining / deferred (not A-blocking)

- Full metric registry (`MetricDefinition`, `calculationVersion`, `inputHash`)  
- Runtime ledger write API (still seed-oriented persistence)  
- Investment market mark-to-market events (Avanza opening embeds prior value)  
- Live opportunity engine (seeded opportunity rows remain; sizing formula improved)  
- Privacy/roles (Workstream N)  
- Real ESLint (Workstream O)

---

## Files changed (primary)

- `packages/financial-engine/src/ledger/reconstruct.ts` (new)  
- `packages/financial-engine/src/ledger/postings.ts` (refunds)  
- `packages/financial-engine/src/period-metrics.ts` (new)  
- `packages/financial-engine/src/forecast.ts`  
- `packages/financial-engine/src/**/*.test.ts`  
- `apps/api/src/metrics/household-metrics.service.ts`  
- `apps/api/src/metrics/ledger-balances.ts` (new)  
- `apps/api/src/dashboard/dashboard.service.ts`  
- `apps/api/src/net-worth/net-worth.service.ts`  
- `apps/api/src/db/seed/persist-event.ts`  
- `apps/api/src/db/seed/demo-household.ts`  
- `apps/api/src/db/seed/seed-decisions.ts`  
- `docs/ROADMAP.md` (FOUNDATION COMPLETE wording)  
- `docs/completion/reports/WORKSTREAM_A_REPORT.md`

---

## Schema / API / UI

| Area | Change |
|---|---|
| Schema | No new migration (used existing splits/recon tables) |
| API | Dashboard + net-worth payloads now derived; shapes unchanged |
| UI | No UI changes required (consumes same schemas) |
| Engine | reconstruct, refunds, period-metrics, forecast delta helpers |

---

## Tests added

- Ledger: refund, reconstruct transfer/liability, mismatch  
- period-metrics unit tests  
- API consistency tests (shared attribution / non-hardcoded forecast)

---

## Gate results

| Gate | Result |
|---|---|
| `pnpm build` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ |
| `pnpm lint` | ✅ (still echo stubs — known false green) |
| Docker API rebuild | ✅ |
| Runtime check | ✅ Dashboard/NW change equal; forecast ≠ 18400; upcoming from subscriptions |
| Mobile/desktop UI | Not re-polished this WS (API-only); smoke via LAN ports still healthy |

---

## Known issues

- Demo NW level changed vs old story (~5.93M vs ~4.82M) because balances are ledger-true, not hand-picked marketing figures.  
- August current-month activity may be thin depending on asOf → NW change uses current display month resolution (same as cashflow).  
- Seeded opportunity **copy** for non-mortgage items still static (acceptable seed content).

---

## Deferred work

See FEATURE_MATRIX / COMPLETION_PLAN Workstreams B–O.

---

## STOP

Workstream A complete for its scope.  
Do **not** auto-start B. Await: `START WORKSTREAM B`
