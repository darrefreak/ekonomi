# SEB CSV account statement — acceptance

**Date:** 2026-08-10
**Verdict:** the importer meets the acceptance bar, with the substitution in §5
stated plainly rather than glossed over.
**Companion documents:** `SEB_CSV_DESIGN.md`, `SEB_CSV_USER_FLOW.md`

---

## 1. Result

| Criterion | Result | Evidence |
|---|---|---|
| SEB detection | **PASS** | SEB-001; 6 unit tests including a comma file with identical headers |
| Exact source parsing | **PASS** | SEB-002; 8 184 of 8 184 rows, 0 parser failures |
| Exact money | **PASS** | SEB-004, SEB-024; 5 unit tests on the observed values |
| Third-decimal policy | **PASS** | SEB-021; refused, not rounded |
| Raw preservation | **PASS** | SEB-007; 8 184 raw rows, values verbatim |
| Account mapping | **PASS** | chosen by the household; type, currency, archived and household all checked |
| Fingerprint / dedupe | **PASS** | SEB-013, SEB-015, SEB-016; 7 identity unit tests |
| Duplicate providerReference | **PASS** | SEB-013; 900 distinct references across 8 184 transactions |
| Same-file reimport | **PASS** | SEB-015, SEB-016; 0 new, nothing created |
| Overlapping import | **PASS** | SEB-017, SEB-017b; 6 000 recognised, 2 184 new, 8 184 total |
| Balance chain | **PASS** | SEB-005; RECONCILED, 8 183/8 183 links, 0 breaks |
| Import preview | **PASS** | SEB-006; 25-row sample, and the browser tests |
| Explicit confirmation | **PASS** | SEB-008; inspection writes no financial event |
| ImportBatch | **PASS** | SEB-009, SEB-022 |
| Import history | **PASS** | SEB-022; browser test |
| Needs Review integration | **PASS** | review reasons on `source_transactions`, which is what `ReviewService` reads |
| Ledger integration | **PASS** | SEB-010, SEB-011; 8 184 events, every entry balances |
| Account reconciliation | **PASS** | SEB-012, SEB-012b, SEB-014; postings, the displayed cache and the statement all agree |
| Independent financial oracle | **PASS** | `accounting-integrity.py` 12/12 |
| Query refresh | **PASS** | `invalidateAfterFinancialImport`; browser test |
| Mobile | **PASS** | 390×844; cards, no sideways scroll, 44px confirm |
| Household isolation | **PASS** | SEB-018, SEB-019; both 404 |
| Currency invariant | **PASS** | `currency-invariant.py` 23/23; non-SEK account refused |
| Audit | **PASS** | SEB-023; four actions, no statement content |
| Build / Lint / Typecheck | **PASS** | 11 / 18 / 18 tasks |
| Tests | **PASS** | 410, 0 failures |
| E2E | **PASS** | 122 passed, 0 failed, 11 skipped by viewport gating |
| Docker | **PASS** | api, worker, web rebuilt and serving |
| Existing pilot invariants | **PASS** | 107 checks across six suites, 0 failures |

**Real pilot import: NOT AUTHORIZED.** This proves the importer against isolated
test households. A first import of real household data needs human approval.

---

## 2. The acceptance run

`scripts/imports/seb-acceptance.py` drives the running HTTP API as a freshly
registered user in a new household. It does not touch the pilot stack, the pilot
database or the demo household.

```
TOTAL 27  PASS 27  FAIL 0
```

| Fact | Value |
|---|---|
| Rows parsed | **8 184** |
| Parser failures | **0** |
| Date range | **2021-08-10 → 2026-08-10** |
| Invalid precision rows | **0** in the statement; refusal proven separately by SEB-021 |
| Raw rows preserved | **8 184** |
| Distinct provider references | **900** across 8 184 transactions |
| Balance chain | **RECONCILED**, 8 183 of 8 183 links, **0 breaks**, ASCENDING |
| New transactions | **8 184** |
| Failed | **0** |
| Needs review | **0** (no manual entries existed to collide with) |
| Same-file reimport | 0 new, 8 184 recognised, no rows created |
| Overlap | 6 000 recognised, 2 184 new, 8 184 total |
| Inspection | 2.3 s |
| Commit | 60.0 s on the worker; the request returned in 0.0 s |

Ledger agreement, which is the check that matters most: the sum of postings on the
imported account plus its opening balance equals the statement's own closing
balance, exactly, in öre — `39168161` both ways.

---

## 3. Test coverage

| Level | Count | What it covers |
|---|---|---|
| Unit — format and money | 20 | BOM, delimiter, headers, wrong delimiter, missing and extra columns, empty file, malformed UTF-8, the observed three-decimal values, precision refusal, calendar-valid dates, quoted delimiters, row length, formula neutralisation |
| Unit — identity and chaining | 14 | reused references, identical-looking rows, stability across runs, account scoping, boundary-shift collisions, ascending and descending chains, named breaks, insufficient data, bigint magnitudes |
| Unit — job ids | 2 | every registry job type produces an id BullMQ accepts |
| Integration — pipeline | 19 | preservation before interpretation, verbatim payloads, precision refusal end to end, same-file reimport, overlap, identical transactions surviving, manual duplicates flagged not merged, `Saldo` as evidence, isolation, archived and non-SEK refusal, non-SEB refusal leaving no batch, broken chains, descending exports, resumed batches, **8 184 rows at scale**, history and detail, file hash not deciding dedupe |
| E2E — browser | 10 | the flow on desktop and mobile |
| Acceptance — HTTP | 25 | the table in §1 |

---

## 4. Defects found while building this

Recorded because each was a real product defect that the tests, not review, found.

1. **The API rejected the upload.** Express defaults to a 100 kB body; a five-year
   statement is about 700 kB base64. Every unit and integration test passed while
   the feature was impossible through its own endpoint. The transport limit now
   clears the per-feature caps.

2. **Confirmation blocked for 58 seconds.** The enqueue failed and fell back to
   inline. The cause predates this workstream: BullMQ refuses a custom job id
   containing a colon, and the shared id builder joins with colons, so **11 of 13
   job types could never be queued** — including the analysis jobs fired after a
   ledger mutation. Nothing surfaced it because callers treat enqueueing as
   fire-and-forget. Fixed centrally in `jobOptionsFor`, with a test covering every
   registered type.

3. **An unreadable `Saldo` discarded a real transaction.** Refusing a row whose
   amount is exact because its *balance* has excess precision loses money data to
   protect a cross-check. The transaction is now kept, the balance dropped, and the
   row flagged.

4. **A genuine overlap reported no overlap.** Rows shared with an earlier import
   are deduplicated when raw rows are preserved and never reach the commit loop, so
   counting only what the loop skipped reported zero. The count now covers the file.

5. **The displayed balance was stale by 341 681,61 kr after an import.**
   `accounts.current_balance_minor` is a cache of the ledger balance, refreshed by
   `EconomicEventsService` on every ordinary write. A batch import calls
   `persistBalancedEvent` directly and so never refreshed it: after 8 184 rows the
   accounts list, net worth and dashboard still showed the opening balance, and the
   statement's reported balance looked like a reconciliation mismatch. Refreshed
   once after the batch now.

   Worth recording *why* it survived: acceptance check SEB-012 verified the ledger
   by summing postings directly, which is the one way of asking that could not
   notice. SEB-012b now checks what the product actually displays.

6. **An account can silently disagree with the bank for ever.** Importing a
   statement that starts at 50 000 kr into an account opened at 0 gives a ledger
   that is correct about every transaction and still reports a balance 50 000 kr
   below the bank. The preview now states the statement's own starting balance
   (§10b of the design), so the difference is visible before confirming. It is
   stated rather than enforced: adjusting the opening balance, or inventing a
   balancing entry, would be the importer writing a number nobody asked for.

---

## 5. What this acceptance does *not* claim

**The real SEB file was not available in this environment.** Sections 38 and 45 of
the brief describe a supplied export to be used locally for acceptance. No such
file exists on this machine — searched across the workspace, the home directory and
the temporary and media paths — so it could not be run.

What was run instead is a synthetic statement built to the brief's stated
characteristics: 8 184 rows, 2021-08-10 to 2026-08-10, UTF-8 with BOM, semicolon
delimited, `YYYY-MM-DD` dates, positive and negative three-decimal amounts, a
running balance, and a deliberately small reference pool so `Verifikationsnummer`
repeats as it does in the real export. Every number in §2 is from that file.

This substitution is honest about what it can and cannot establish:

- **Established.** The format contract, exact money at the observed scale and
  precision, identity and deduplication, overlap, balance chaining in both
  directions, ledger correctness at 8 184 rows, and performance.
- **Not established.** Any irregularity peculiar to the real export that the brief
  did not describe — an unexpected column on some rows, a different amount format
  in older history, a `Text` field containing an unescaped semicolon, gaps where
  the statement was cut mid-day. The importer refuses rather than guesses in each
  of those cases, and reports the row, so the failure mode is a named invalid row
  rather than a corrupted ledger. But the specific count of such rows in the real
  file is unknown.

**To close this gap:** place the real export somewhere readable and run
`python3 scripts/imports/seb-acceptance.py` after pointing it at the file, or
simply import it through the product into a throwaway household and read the
preview. The preview alone answers it — rows, period, invalid count and balance
verdict — before anything is booked. That is the design working as intended: the
first thing a real file meets is a read-only inspection.

No real bank statement was committed to this repository, used as a fixture, or
quoted in any document.

---

## 6. Scope held

Implemented: SEB CSV Account Statement V1, and nothing else.

Not implemented, as instructed: generic CSV auto-mapping, Excel, PDF, OCR, the SEB
API, Open Banking, BankID, browser automation, Kivra, Revolut, SBAB, Avanza,
Nordnet, Swish.

The extension point for the next bank is three functions, described in §15 of
`SEB_CSV_DESIGN.md`. Adding one must not require touching the ledger.
