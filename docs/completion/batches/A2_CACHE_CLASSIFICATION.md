# A2 — Cache / balance field classification

| Usage | Classification | Notes |
|---|---|---|
| `accounts.openingBalanceMinor` | AUTHORITATIVE_OPENING | Start of ledger reconstruction |
| `accounts.currentBalanceMinor` | VALID_CACHE | Derived ending balance; refreshed by `LedgerTruthService.refreshDerivedCaches` |
| `accounts.reportedBalanceMinor` | VALID_PROVIDER_METADATA | External evidence; never overwrites ledger |
| `account_balance_snapshots` (`ledger_reconcile`, `nw_history_reconstruct`) | VALID_CACHE / DERIVED_SNAPSHOT | Built from openings + postings |
| `HouseholdMetricsService.getFinancialSnapshot` | LEDGER_TRUTH | Uses `getLedgerAlignedAccountRows` (reconstruct) |
| Account list `currentBalance` | VALID_CACHE | Display; refreshed after economic writes / reconcile |
| Account detail `ledgerBalance` / `reportedBalance` | LEDGER + PROVIDER | Discrepancy shown when MISMATCH |
| Debt / wealth outstanding | VALID_CACHE | Read cache after ledger refresh; not an independent SoT |

## Invalidation strategy

1. Any economic write (`EconomicEventsService`) → `refreshDerivedCaches`
2. `RECONCILE_ACCOUNT_BALANCES` job → `reconcileHousehold` → refresh caches + snapshots
3. Metrics position always reconstructs from openings + postings (does not trust stale cache)
4. Never create silent ADJUSTMENT postings to force MATCHED
