# SEB CSV account statement — the user flow

What a household actually does, and what the product does at each step. The
reasoning behind the design is in `SEB_CSV_DESIGN.md`; the measured results are in
`SEB_CSV_ACCEPTANCE.md`.

---

## 1. Getting the file out of SEB

In SEB's internet bank, open the account, choose **Kontoutdrag**, pick a period,
and export as CSV. The product accepts that export as it comes: UTF-8 with a BOM,
semicolon separated, three decimal places. Nothing needs editing first, and the
file does not need renaming — the format is recognised from its contents, never
from its name.

Periods may overlap freely. Exporting January–December after already importing
January–August is the normal case, not a mistake to avoid.

## 2. Where it goes in the product

**Importer** in the sidebar, or **Mer → Importer** on a phone.

The page has the import itself at the top and previous imports below it.

## 3. Choose a file and an account

Two fields, both required.

The account cannot be inferred. SEB's export contains no account identity the
product is willing to trust — no clearing number, no account number, nothing that
distinguishes one of a household's SEB accounts from another. Guessing would risk
booking a statement onto the wrong account, so the household chooses.

Only accounts that can actually receive a statement are offered: in this
household, not archived, in SEK, and of a bank or card type. If there is exactly
one such account it is preselected; with several, nothing is chosen for you. If
the right account does not exist yet, the field links to account creation rather
than inventing one.

## 4. Read what the file contains

Pressing **Granska innehållet** parses every row, preserves all of them, and shows
what was found. **No transaction is booked at this point.** The file has been
stored and its rows recorded, and that is deliberately separate from deciding
they are true.

The preview states:

| | |
|---|---|
| **Fil** | the file's own name |
| **Konto** | where it will be booked |
| **Period** | the first and last booking date found |
| **Rader** | how many rows the file contains |
| **Nya** | how many are not already imported |
| **Redan importerade** | how many this household already has |
| **Ogiltiga** | how many cannot be used, and why |
| **Saldo** | the closing balance the statement reports |
| **Saldokontroll** | whether the statement adds up against itself |

Below that, a sample of the most recent rows — twenty-five, not eight thousand.
A table on a wide screen, cards on a phone.

**Saldokontroll** is the statement checking itself. For every pair of adjacent
rows the product verifies that the previous balance plus this row's amount equals
this row's balance. When that holds throughout, it says *Kontoutdraget går ihop*.
When it does not, each disagreeing row is listed with its number, what the
statement reported and what the arithmetic expected. An import is never described
as reconciled when the source does not add up.

**Ogiltiga** rows are listed individually with a reason. The most likely one:
SEB writes three decimals and öre hold two, so a row whose third decimal is not
zero cannot be expressed exactly. That row is not rounded, not truncated and not
approximated — it is refused, and named, so the household can see exactly what
was left out.

## 5. Confirm

The button says what will happen: **Importera 7 942 transaktioner**. When there is
nothing new it says so and is disabled, rather than doing nothing when pressed.

**Avbryt** leaves without booking anything. The parsed rows stay recorded, so the
same file can be reviewed again later without re-uploading.

## 6. While it runs

Confirmation hands the work to a background worker and returns immediately.
Thousands of rows take a while — about a minute for a five-year statement — and
the page can be left and returned to. The import's status carries the progress.

## 7. When it finishes

Either *Importen är klar* with the number booked, or *Klar med anmärkningar* when
something needs attention: rows that could not be used, rows that may duplicate
something already recorded, or a balance chain that did not agree.

Everything downstream updates without a reload — balances, the transaction list,
the dashboard, net worth, cashflow, the budget's actuals, review items.

## 8. Rows that need a person

Import ambiguity goes to **Granska**, the same place as every other uncertainty.
There is no separate import inbox.

**Possible duplicate.** A household that typed a transaction in before importing
history will have both. The import never deletes or merges a manual entry: a row
matching an existing manual entry on the same account, for the same amount, within
three days, is flagged with

> Den här SEB-transaktionen kan motsvara en redan registrerad transaktion.

and the household matches them, keeps both, or leaves it. Descriptions are not
required to match, because "ICA" and "ICA MAXI STORMARKNAD" are the same shop.

**Unknown merchant.** Text the product cannot resolve stays unknown. `46700280624`
is not given an invented meaning to improve a statistic.

**Unreadable balance.** If a row's amount is exact but its reported balance is not
representable, the transaction is imported and the balance is dropped. The money
is the amount; the balance is the bank's evidence about it, and losing a real
transaction to protect a cross-check would be the wrong trade.

## 9. Importing the same period twice

Safe, and the ordinary case.

Every row is identified by the account it belongs to, its dates, SEB's reference,
its text, its amount and the balance it left behind. A row already imported is
recognised however it arrives — the same file again, a longer export, or a
differently ordered one — and is not booked twice.

Two genuinely identical transactions on the same day both survive. SEB's running
balance is what distinguishes them: two separate transactions leave different
balances behind. The rule the design follows: a duplicate you can merge is a
nuisance; a transaction silently deleted is a corrupted ledger.

## 10. Previous imports

Each entry shows source, account, file, date, period, row counts, and the balance
verdict. Opening one shows the format, the file's checksum, and every row that
could not be imported with its reason.

## 11. What the importer will not do

- It will not accept a CSV that is not this export. A comma-separated file with the
  same six headers is refused, and so is any file whose headers differ.
- It will not evaluate anything in the file. A cell beginning `=` or `@` is data,
  neutralised when displayed or exported, never executed.
- It will not accept a file over 8 MB or 100 000 rows, and says so plainly. A
  five-year statement is around half a megabyte.
- It will not put SEB's `Saldo` into the ledger. It is evidence: it validates the
  statement, is kept per row, and becomes one reported-balance snapshot at the
  closing date.

## 12. Adding another bank later

The provider-specific part is a detector, a row parser, and optionally a reader
for a running balance. Everything else — identity, preservation, deduplication,
overlap, review, ledger persistence, snapshots, the batch lifecycle and this whole
screen — is shared. See §15 of `SEB_CSV_DESIGN.md`.
