# SEB CSV account statement — import design (V1)

**Status:** implemented
**Scope:** SEB's current CSV account-statement export, one target account per
import. Nothing else. No generic CSV mapper, no other bank, no API or Open
Banking.

---

## 1. What already exists, and what this reuses

This is not a new import subsystem. The repository already has the architecture
ADR-0008 requires, and this workstream adds a provider adapter on top of it.

| Existing | File | Reused for |
|---|---|---|
| `import_batches` | `apps/api/src/db/schema-economic.ts` | one row per upload |
| `raw_import_records` | same | one row per source CSV line, verbatim |
| `source_transactions` | same | normalized bank rows |
| `financial_events`, `ledger_entries`, `ledger_postings` | same | economic truth |
| `source_transaction_links` | same | source row → event |
| `account_balance_snapshots` | same | SEB's `Saldo` as reported evidence |
| `persistBalancedEvent` | `apps/api/src/db/seed/persist-event.ts` | atomic event + entry + postings + idempotency |
| `buildCashExpense` / `buildIncome` | `packages/financial-engine/src/ledger/postings.ts` | balanced drafts |
| `financialCommandIdempotency` | `apps/api/src/common/command-idempotency.ts` | one economic effect per command |
| `assertPostingCurrencyInvariant` | `apps/api/src/db/posting-currency-guard.ts` | posting currency = account = household |
| `ReviewService` | `apps/api/src/review/review.service.ts` | Needs Review, which is **derived**, not a table |
| `ObjectStorageService.putObject` | `apps/api/src/storage/object-storage.service.ts` | the original file |
| `auditLogs` | `apps/api/src/db/schema.ts` | significant events |

Three schema extensions were needed, and nothing was replaced:

- `import_batches` gained provider/format/file/target-account/balance-chain
  columns and richer statuses. It previously tracked only counts and
  `RUNNING | COMPLETED | FAILED | PARTIAL`.
- `raw_import_records` gained `row_number`, so a preserved row can be shown to
  the user as "line 4 812 of the file".
- `source_transactions` gained `provider_reference` and
  `reported_balance_after_minor`. SEB's `Verifikationsnummer` is not an
  `externalId` (it is not unique), and `Saldo` is evidence that had nowhere to
  live.

**Needs Review is derived.** `ReviewService.list()` computes review items by
querying `source_transactions` with predicates. There is no review table, so
import ambiguity must be expressible as *state on the source transaction*. This
is why the design carries `review_reason` on the source transaction rather than
inventing a queue.

---

## 2. Detected format

| Property | Value |
|---|---|
| Encoding | UTF-8, BOM tolerated and stripped |
| Delimiter | `;` |
| Headers | `Bokföringsdatum;Valutadatum;Verifikationsnummer;Text;Belopp;Saldo` |
| Date format | `YYYY-MM-DD` |
| Decimal separator | `.` |
| Observed scale | three decimal places (`-306.000`, `-130.930`, `596242.280`) |
| Line endings | `\r\n` or `\n` |

Identity assigned on a successful match:

```
provider = SEB
sourceKind = FILE_IMPORT
format = SEB_CSV_ACCOUNT_STATEMENT
version = 1
confidence = 1.0
```

### Detection rules

Detection reads the header line only, and requires **all six headers, by name,
in order**. It is deliberately strict:

- A BOM before the first header is stripped before comparison.
- Surrounding whitespace per header is tolerated.
- A different delimiter is rejected, including a comma file with the same six
  names.
- Six unrelated semicolon-separated columns are rejected, because the names must
  match. Column *count* is never sufficient evidence.
- Extra trailing columns are rejected in V1. A changed export shape should be
  noticed by a person, not guessed at by the parser.

Filename is never an input to detection.

---

## 3. Money parsing — the exact rule

SEB writes three decimals. SEK has two. Rounding a household's money to make an
import succeed is not acceptable, so the rule is explicit:

```
"100.000"     → 10000 öre          exact
"-130.930"    → -13093 öre         exact
"596242.280"  → 59624228 öre       exact
"0.010"       → 1 öre              exact
"0.001"       → REJECTED           third decimal is not 0
"123.456"     → REJECTED           third decimal is not 0
```

If the third decimal is `0`, the value is exactly representable in öre and is
accepted. If it is anything else, the row is **not** rounded, truncated or
approximated — it is classified `INVALID_AMOUNT_PRECISION`, kept as a raw record,
excluded from the ledger, and reported to the user.

Implementation constraints, enforced by test:

- The source string is parsed character by character into `bigint`.
- `parseFloat`, `Number(...)` and `Math.round(x * 100)` appear nowhere in the
  import path.
- One, two or three decimals are all accepted (`123.4`, `123.45`, `123.450`);
  four or more are rejected as unrecognised precision.
- Thousand separators are not expected in this export; a space or `,` inside the
  number is rejected rather than guessed at.

`kronorStringToMinor` in `packages/domain` was **not** reused here: it rejects
anything beyond two decimals, which is every SEB row. The SEB parser is a
separate, format-specific function so the domain rule for user input stays
strict.

---

## 4. Date parsing

`Bokföringsdatum → bookingDate`, `Valutadatum → valueDate`.

Both are parsed as exact `YYYY-MM-DD` date-only strings with a real calendar
check, and stored in Postgres `date` columns. They never pass through a
JavaScript `Date`, so no timezone can shift a booking across midnight.

`2026-02-30`, `2026-13-01`, `26-08-10`, `2026/08/10` and an empty value are all
rejected as `INVALID_DATE`. Nothing is coerced.

---

## 5. Raw preservation

Every data line becomes one `raw_import_records` row before any interpretation:

```json
{
  "Bokföringsdatum": "2026-08-08",
  "Valutadatum": "2026-08-08",
  "Verifikationsnummer": "…",
  "Text": "…",
  "Belopp": "-130.930",
  "Saldo": "596242.280"
}
```

Field values are stored exactly as they appeared — original spacing, original
casing, original three-decimal strings. `Text` is preserved before any
normalization, so the user can always see what SEB actually sent.

`hash` is the row fingerprint (§6), which the existing
`raw_import_records_household_hash` unique index then enforces per household.
`row_number` is the 1-based data-line index. `schema_version` is
`SEB_CSV_ACCOUNT_STATEMENT_V1`.

---

## 6. Source identity and the duplicate problem

`Verifikationsnummer` is **not** unique and is never used alone.

The fingerprint is a SHA-256 over a canonical, length-prefixed serialization:

```
sha256(
  "SEB_CSV_ACCOUNT_STATEMENT_V1" |
  accountId |
  bookingDate | valueDate |
  providerReference |
  rawDescription |
  amountMinor |
  reportedBalanceAfterMinor |
  occurrenceIndex
)
```

Each field is length-prefixed (`6:100.00`) so no combination of field contents
can imitate a different row by shifting a delimiter.

### Why `occurrenceIndex`, and why `Saldo` makes it safe

Two legitimately identical transactions can occur — two identical coffees on the
same day, same amount, same text. Hashing the visible fields alone would collapse
them and **silently delete a real transaction**, which is the one outcome this
design refuses.

`Saldo` resolves it. Because SEB reports the running balance after each
transaction, two genuinely separate transactions have *different* `Saldo` values
even when everything else matches, so they fingerprint differently and both
survive.

The residual case is a row whose every field including `Saldo` is identical to
another. That can only happen for a zero-amount row or a true file-level
duplication. `occurrenceIndex` — the count of preceding rows in the same file
with an identical field tuple — separates them, so a file containing the same
tuple twice yields two source transactions, and re-importing that file still
matches both.

The rule this encodes: **prefer a false review over silently dropping a real
transaction.**

---

## 7. Same-file reimport, and overlapping files

Both fall out of the fingerprint plus the existing unique index, and neither
depends on the file hash.

- **Same file twice.** Every fingerprint already exists. Every row is recorded
  `ALREADY_IMPORTED`; no source transaction, financial event, ledger entry or
  posting is created. The second batch completes with `newRecords = 0`.
- **Overlapping periods** (Jan–Aug, then Jan–Dec). Jan–Aug rows match by
  fingerprint and are counted existing; Sep–Dec are new. The user is never asked
  to export non-overlapping periods.

An overlapping export re-states the same running balance for the same
transactions, so fingerprints are stable across exports. A *changed* balance for
an otherwise identical row means the statement genuinely differs, and treating it
as a new row is the safe reading.

`fileHash` (SHA-256 of the uploaded bytes) is recorded for audit and for telling
the user "this is the same file you imported on 3 May". It is **never** the
dedupe key, because the same transactions can legitimately arrive in a
differently-cut file.

---

## 8. Manual-versus-imported duplicates

A household may have typed a transaction before importing history. Manual
entries are never deleted or merged automatically.

After a row is created, a candidate search looks for an existing source
transaction on the same account with the same `amountMinor`, a `bookingDate`
within ±3 days, and no import provenance (a manual entry). A match sets
`review_reason = POSSIBLE_DUPLICATE` on the imported row, and it surfaces in
Needs Review as:

> Den här SEB-transaktionen kan motsvara en redan registrerad transaktion.

The user matches, keeps both, or leaves it. Descriptions are deliberately *not*
required to match, because "ICA" and "ICA MAXI STORMARKNAD" are the same shop —
but weak evidence produces a review item, never a merge.

---

## 9. Balance chain validation

`Saldo` is the statement's own check on itself.

Ordering is **detected, not assumed**: the first and last parsable rows'
`Bokföringsdatum` decide `ASCENDING` or `DESCENDING`, and for a single row or an
undetermined order the chain is reported `INSUFFICIENT_DATA` rather than guessed.

Walking rows in chronological order, for each adjacent pair:

```
saldo(previous) + belopp(current) == saldo(current)
```

All arithmetic is `bigint`. The result is a `SebBalanceChainResult`:

```
rowsChecked, rowsReconciled, breakCount, breaks[],
openingReportedBalanceMinor, closingReportedBalanceMinor,
direction, status
```

Statuses: `RECONCILED` (no breaks), `RECONCILED_WITH_WARNINGS` (breaks under a
small threshold, listed individually), `BROKEN` (more than that), and
`INSUFFICIENT_DATA`.

A break is always shown with its row number and the expected and actual balance.
The import is never described as fully reconciled when the source does not add
up.

---

## 10. `Saldo` is evidence, never a posting

`Saldo` never becomes income, an expense, an adjustment or a ledger posting. It
is used for exactly three things:

1. validating the chain (§9),
2. `source_transactions.reported_balance_after_minor`, as provenance,
3. one `account_balance_snapshots` row per import, at the statement's closing
   date, with `source = "seb_statement"`.

**One snapshot per import, not 8 184.** The existing unique key is
`(account_id, as_of, source)`, and the architecture prefers sparse snapshots. The
closing balance is what reconciliation needs; every intermediate balance is
already preserved per row. Ledger truth continues to come only from postings, and
`accounts.current_balance_minor` remains a derived cache.

---

## 10b. The account has to start where the statement starts

`Saldo` is only reconcilable against a ledger that begins from the same place. An
account created with an opening balance of 0 and then fed a statement that starts
at 50 000 kr produces a ledger that is right about every single transaction and
still reports a balance 50 000 kr below the bank — permanently, and with nothing
obviously wrong to look at.

The preview therefore states `statementStartingBalanceMinor`, derived as the first
row's `Saldo` minus its `Belopp`: what the account held before the statement's
first transaction. A household importing history should give the account that
opening balance.

This is stated rather than enforced. The importer does not adjust an account's
opening balance, and it certainly does not invent a balancing entry — either would
be the import writing a number nobody asked for into the ledger.

## 10c. The derived balance cache

`accounts.current_balance_minor` is a cache of the ledger-calculated balance, and
every ordinary write refreshes it through `EconomicEventsService`. A batch import
calls `persistBalancedEvent` directly, so it must refresh the cache itself — once,
after the batch, never per row and never inside a financial transaction.

Without that, an import of 8 184 rows left the cache holding the opening balance
while the postings said something 341 681 kr different, and the statement's
reported balance then looked like a reconciliation mismatch. The refresh uses the
household's current date rather than the statement's last day: the cache means
"now", and a statement can end in the past.

## 11. Import lifecycle

```
UPLOADED → INSPECTING → READY_FOR_REVIEW → IMPORTING → COMPLETED
                                                     ↘ COMPLETED_WITH_WARNINGS
     ↘ FAILED (from any stage)
```

- **UPLOADED / INSPECTING** — file stored, detected, every row parsed, raw
  records written, balance chain computed. No financial write yet.
- **READY_FOR_REVIEW** — the preview the user confirms: account, period, row
  counts, new/existing/review/invalid, closing balance, chain verdict.
- **IMPORTING** — economic writes, in chunks.
- **COMPLETED** — everything reconciled and no invalid rows.
- **COMPLETED_WITH_WARNINGS** — finished, but invalid rows, review items or
  balance breaks exist. Reported honestly rather than as success.

Inspecting and committing are separate requests. Selecting a file never writes a
financial event.

---

## 12. Transaction boundaries, atomicity and retry

The choice, stated plainly because §26 asks for it:

- **Not** one 8 184-row Postgres transaction. That holds locks for the whole
  import and makes partial failure unrecoverable.
- **Inspection** writes raw records in chunks of 500 inside one transaction per
  chunk. Raw preservation is independent of interpretation, so a chunk that
  commits is simply progress.
- **Commit** processes rows in chunks of 200. Each *economic command* keeps the
  existing atomic guarantee: `persistBalancedEvent` writes the financial event,
  ledger entry, postings, source transaction, links and the idempotency row in a
  single transaction. One row failing rolls back that row only.
- **Idempotency** is per row, keyed on the fingerprint, through the existing
  `financialCommandIdempotency` table with command type `IMPORT_SEB_CSV_ROW`. A
  retried chunk resolves to the same event instead of creating a second one.

Retry of an interrupted batch is therefore safe and resumable: completed rows are
skipped by fingerprint, `FAILED` rows are retried, and no row can produce two
economic effects.

---

## 13. Classification

The parser answers *what did SEB send*. It never decides meaning.

After normalization, the existing merchant and category logic runs. Text it
cannot resolve stays `UNKNOWN` with a review reason — `46700280624` is not given
an invented meaning to improve a percentage. Internal transfers, credit-card
payments, mortgage principal and investment transfers are recognised by the
existing reconciliation and classification path, not by bank-specific parser
rules.

---

## 14. Security

The CSV is untrusted input.

| Risk | Handling |
|---|---|
| Oversized upload | 12 MB base64 / 8 MiB decoded / 100 000 data rows, all rejected with a readable message |
| Formula injection | Nothing is ever evaluated. Values beginning `= + - @ TAB CR` are prefixed with `'` **only** when rendered or exported, never in stored data |
| Malformed UTF-8 | Decoded with a strict decoder; failure fails detection |
| Wrong delimiter / columns | Detection refuses the file |
| Very long text | `Text` truncated to 500 characters for the normalized description; the raw payload keeps the original |
| Row bombs | Row cap plus per-row size cap |
| Parser exceptions | Every row is parsed inside its own guard; one bad row becomes an invalid row, never a failed import |

Audit entries record upload, inspection, confirmation and completion. Raw CSV
content is never written to application logs — it lives in the database and in
object storage, both inside the erasure and recovery paths.

---

## 15. Extending to another bank

The provider-specific surface is deliberately small. A new bank adapter supplies:

1. a **detector** — headers, delimiter, encoding → provider/format/version/confidence;
2. a **row parser** — source columns → `ParsedStatementRow` (booking date, value
   date, provider reference, raw description, `amountMinor`, optional reported
   balance);
3. optionally a **balance-chain reader**, if the export reports running balances.

Everything after that — fingerprinting, raw preservation, dedupe, overlap,
review, ledger persistence, snapshots, batch lifecycle, UI — is shared and
provider-agnostic. `apps/api/src/imports/statement-import.service.ts` holds the
shared pipeline; `apps/api/src/imports/seb/` holds only SEB's three pieces.

Adding a bank must not require touching the ledger.
