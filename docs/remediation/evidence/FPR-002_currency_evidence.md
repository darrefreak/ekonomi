# FPR-002 evidence — postings booked onto a currency-excluded account

Captured 2026-08-09 from the development database before the rows were removed,
so the defect the invariant fix closes stays on the record after the fixtures
that carried it are gone.

These households were created by `scripts/pilot/reacceptance-adversarial.py`
during the Final Targeted Pilot Re-acceptance. Each holds a `CHECKING` account
in EUR inside a household that counts in SEK — the shape of a row created before
FPA-001's account guard existed — and each then accepted money through the
ordinary product API.

## What the rows showed

| household | base | account | account currency | posting currency | side | öre |
|---|---|---|---|---|---|---|
| Divergenstest | SEK | Inkomstbok (INCOME) | SEK | SEK | credit | 250 000 |
| Divergenstest | SEK | Legacy EUR (CHECKING) | **EUR** | **SEK** | credit | 100 000 |
| Divergenstest | SEK | Legacy EUR (CHECKING) | **EUR** | **SEK** | debit | 250 000 |
| Divergenstest | SEK | Utgiftsbok (EXPENSE) | SEK | SEK | debit | 100 000 |
| Uteslutet (×2 runs) | SEK | Gammalt eurokonto (CHECKING) | **EUR** | **SEK** | credit | 100 000 |
| Uteslutet (×2 runs) | SEK | Gammalt eurokonto (CHECKING) | **EUR** | **SEK** | debit | 250 000 |
| Uteslutet (×2 runs) | SEK | Inkomstbok (INCOME) | SEK | SEK | credit | 250 000 |
| Uteslutet (×2 runs) | SEK | Utgiftsbok (EXPENSE) | SEK | SEK | debit | 100 000 |

Six postings in total carried a currency their account did not hold, which is
what `ACC-005` in `scripts/pilot/accounting-integrity.py` reported.

## Why it mattered

The balance-sheet leg landed on an account the totals exclude, while the nominal
leg landed on the household's income and expense books, which the totals do
count. For `Divergenstest` that produced:

```
ledger truth   opening 4 700 000 + income 250 000 − expenses 100 000 = 4 850 000 öre
product        net worth 4 200 000 öre
dashboard      this month's income 250 000 öre, net worth unmoved
```

The household's own income statement moved and its balance sheet did not.

## Why the rows are gone

`docs/remediation/FINAL_INVARIANT_BLOCKERS_REPORT.md` §22 of the brief allows
either excluding documented fixtures from the clean acceptance run or removing
them once the evidence is preserved. Removing them is the honest option: leaving
six permanently invalid postings in the database would make `ACC-005` fail for
every future acceptance run, which trains the next reader to ignore it.

The defect is reproducible on demand instead. Against the code *before* this
remediation, `reacceptance-adversarial.py` recreates it in seconds; against the
code after it, `scripts/pilot/currency-invariant.py` CUR-010…CUR-014 shows the
same attempts being refused at the ledger boundary.

Removal was a household-scoped delete of these three ids:

```
43770ffc-561d-4192-ba89-c14839bd443c   Uteslutet
84aa5df4-5a44-47a0-8561-ca5467729ff3   Uteslutet
92aa7014-c540-4f3b-8c46-06711300be67   Divergenstest
```
