# Demo Financial Reconciliation

**Date:** 2026-08-07  
**Household:** `Familjen Demo`  
**asOf:** `2026-08-01` (`DEMO_AS_OF_DATE`)  
**Script:** `apps/api/scripts/p0-demo-recon.ts`

---

## Procedure

1. Existing migrated DB (migrations through `0019_batch_c2_metric_registry`)
2. Demo household present (prior seed)
3. Reconstruct ledger balances
4. Run `LedgerTruthService.reconcileHousehold`
5. Compare ASSET vehicle ledger vs `vehicles.estimatedValueMidMinor`

---

## Result (observed)

| Check | Value |
|---|---|
| Reconcile mismatches | **0** |
| Cache refresh updated | 10 accounts |
| House ASSET ledger | 6 800 000,00 (opening = ledger = reported) |
| Vehicle ASSET ledger | 280 000,00 |
| Vehicle `estimatedValueMidMinor` | 280 000,00 |
| Loan outstanding (ledger) | 195 000,00 |
| Mortgage (ledger) | 3 670 000,00 |
| Investment (ledger) | 1 180 000,00 |

Sample cash/liability rows also matched ledger ↔ cache ↔ reported in this run.

---

## Notes

- Vehicle 300k→280k depreciation coherence holds for seed (opening 300k + write-down 20k implied by ledger ending 280k matching mid valuation).
- One CHECKING account shows a **negative** ledger balance (−24 881,00) — treated as intentional demo state, not a reconcile mismatch (reported equals ledger).
- Financed vehicle debt is represented as LOAN **opening** balance, not as a purchase financial-event chain (see P0 remaining fixes).
- This is a reconciliation of **seeded** demo data, not a proof that every runtime purchase path exists.

---

## Verdict

Demo seed is **coherent under reconcile** for cash/liabilities/investments/assets at asOf.  
Does **not** by itself close P0-1 residuals (list/detail cache paths) or missing purchase-event modeling.
