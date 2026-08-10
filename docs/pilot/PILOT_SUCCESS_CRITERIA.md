# Pilot Success Criteria

What the pilot has to demonstrate before anyone should trust this product with a
household's money, and how each thing is measured.

The technical acceptance work already proved the system is internally
consistent. None of it proves the numbers match what a household believes about
its own finances, because until now there has been no household. That is the
question the pilot answers.

A criterion is met only if it is measured, not felt.

---

## 1. Financial correctness

The pilot fails here if any single one of these is wrong, however good
everything else looks.

| Criterion | How it is measured | Pass condition |
|---|---|---|
| Net worth reconciles | the household compares the dashboard figure with their own reckoning — bank balances, mortgage statement, vehicle value — at the start and at the end | agrees to the krona, or every difference is explained and traced to a specific entry |
| Account balances reconcile | each account's balance in the product against the bank's own figure, on the same date | every account matches, or the difference is a transaction the household can point to |
| Internal transfers are not spending | move money between own accounts, then read the month's expenses | expenses unchanged; net worth unchanged |
| Credit-card payments are not double-counted | record a card purchase, then pay the card | the purchase is the expense; the payment moves money and adds no expense |
| Mortgage principal and interest are correct | record a real mortgage payment with the split from the statement | debt falls by the principal exactly; interest appears as an expense; net worth falls by the interest only |
| Vehicle economics stay coherent | enter a real vehicle with its purchase, running costs and current value | the vehicle contributes its value to net worth; costs appear as costs; total cost of ownership matches what the household believes they have spent |
| The financial oracle stays green | `python3 scripts/pilot/accounting-integrity.py`, weekly and at the end | 12 / 12, every week |
| Net worth history is explainable | for each month shown, the change equals income minus expenses for that month | every step reconciles |

The last two are the ones that catch what nobody thought to look for. The oracle
derives its figures from the double-entry identity rather than from the
product's own aggregation, so it cannot be wrong in the same way the code is.

---

## 2. Product usefulness

Softer, but not unmeasurable. Each is recorded as a yes/no with a sentence of
evidence from the household, not from whoever built it.

| Criterion | Pass condition |
|---|---|
| The dashboard is understandable | the household can explain, unprompted, what each figure means and whether it is good news |
| Transactions are practical to review | a month of transactions can be reviewed and categorised in one sitting without frustration |
| Budget works | a budget can be created, kept and compared against reality for a full month, and the remaining figure is believed |
| Forecast is useful | the forecast is close enough to be worth looking at, and where it is wrong the household can say why |
| Opportunities are explainable | every recommendation shown can be traced to figures the household recognises; none is mysterious |
| AI answers are grounded | every advisor answer cites the household's own numbers, and none contains a figure that does not appear elsewhere in the product |
| Vehicle analysis is useful | the replacement and cost analysis tells the household something they did not already know, or confirms something they suspected |

A pilot that is financially perfect and useless has still failed. So has one
that is delightful and wrong — but that one fails faster and worse.

---

## 3. Reliability

| Criterion | How it is measured | Pass condition |
|---|---|---|
| No data loss | daily `pnpm pilot:check`; counts compared week to week | nothing entered ever disappears |
| No duplicate economic events | look for identical events on the same day; watch for double submissions on slow connections | none; a retry produces one event |
| No unexplained balance drift | reconcile weekly | every change traces to an entry the household made |
| No cross-household exposure | the pilot household is the only real one; the demo household must stay separate | no data from one appears in the other |
| Backup succeeds | `pnpm backup:pilot` before every session and daily | `BACKUP COMPLETE` every time, no exceptions |
| Restore stays viable | one restore drill mid-pilot into the recovery environment | `RECOVERY PREPARED`, and the household's figures in the recovery copy match the backup |
| The system stays up | daily check | no unexplained 500 on any financial surface |

---

## 4. Privacy

| Criterion | How it is measured | Pass condition |
|---|---|---|
| Erasure remains fail-closed | at the end of the pilot, if the household asks for deletion, watch what it reports | either `completed` with the objects provably gone, or a `503` that removed nothing and can be retried — never a `completed` that leaves data |
| No sensitive data in logs | grep the pilot logs for the household's own markers before archiving them | no secrets, tokens, personnummer or document contents |
| Recovery does not resurrect deleted data | if anything is erased during the pilot, run a recovery from a backup that predates it | the erased household is absent from the recovery copy |
| Export works | the household exports their data at least once | the export contains what they expect and opens |

---

## What "the pilot succeeded" means

All of section 1, all of section 3, and all of section 4. Section 2 is scored
and discussed rather than passed or failed: a product can be worth continuing
with a weak forecast, but not with a wrong balance.

Anything in [`PILOT_ABORT_CRITERIA.md`](./PILOT_ABORT_CRITERIA.md) ends the
pilot regardless of how the rest is going.

## Recording the outcome

Keep a running log during the pilot — date, what was done, what was expected,
what happened. At the end, write the result against each criterion above, with
the evidence. That document is what the next decision is made from.
