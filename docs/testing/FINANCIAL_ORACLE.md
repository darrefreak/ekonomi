# The independent financial oracle

**Status:** in force
**Introduced by:** RT2 critical remediation
**Reason:** RT2-001

---

## Why this exists

RT2-001 was a net worth error of 32 005,36 kr on the shipped demo. Every test in the
repository passed. The reason is worth stating plainly, because it is the lesson that
shaped everything in this document:

> All five net worth surfaces agreed with each other, and all five were wrong. They
> agreed because they all read the same aggregation. Consistency between surfaces
> measures wiring, not arithmetic.

An oracle is a second opinion that cannot be wrong in the same way as the code it checks.
The rule that makes it one:

> **An expected value may never be produced by the code under test, nor by anything that
> shares its arithmetic.**

Concretely, an expectation must not come from `calculateNetWorth`,
`bucketBalancesForNetWorth`, `netWorthFromTypedBalances`, `getFinancialSnapshot`,
`positionFromAccounts`, the metric registry, or any service that calls them. It comes from
positions the test itself knows and arithmetic the test itself writes out.

---

## The canonical sign convention the oracle restates

The convention lives in `packages/financial-engine/src/account-sign.ts` and is documented
in [`docs/DOMAIN_INVARIANTS.md`](../DOMAIN_INVARIANTS.md). Each oracle **restates** it
rather than importing it, so a future change to the convention breaks the oracle loudly
instead of being silently inherited:

```
balance = the account's signed economic position, from the household's point of view

asset-class    CHECKING SAVINGS CASH INVESTMENT PENSION CRYPTO ASSET
               +100 = the household holds 100;  −100 = overdrawn
liability-class MORTGAGE LOAN CREDIT_CARD
               +100 = the household owes 100;   −100 = the lender owes the household 100
nominal         EXPENSE INCOME — never part of a balance-sheet position

netWorth = Σ asset-class − Σ liability-class          (no absolute values anywhere)

posting delta   asset/nominal: debit +, credit −
                liability:     credit +, debit −
```

Presentation is a separate layer. `outstandingDebtMinor` clamps at zero so a household
with an overpaid card is shown as owing nothing, and `liabilityCreditMinor` shows the
credit as its own positive magnitude. Neither may appear inside an economic aggregation;
that substitution *was* RT2-001.

---

## The three oracles

### 1. Arithmetic — `packages/financial-engine/src/account-sign.test.ts`

Pure, no database. A table of eleven balance sheets with hand-computed expectations, each
checked twice: the hand-written number must equal a locally written oracle function (so a
typo in the table cannot define truth), and the product aggregation must equal the same
number. Plus linearity: every account class is perturbed and net worth must move by
exactly the expected amount, including pushing a card past zero into credit.

### 2. Ledger — `apps/api/src/metrics/financial-oracle.test.ts`

Database-backed. Reads `accounts`, `ledger_postings`, `ledger_entries` and
`financial_events` and recomputes the position here, then requires
`getFinancialSnapshot` to agree on net worth, cash, investments, assets and the signed
liability component — **after every step**, not only at the end. It covers what only a
database can: real opening balances, real postings, and the liability matrix.

| Scenario | Independent expectation |
|---|---|
| Openings across every class | 250 000 + 400 000 + 4 000 000 − (3 000 000 + 150 000) = 1 500 000 kr |
| Credit card purchase 1 000 kr | net worth −1 000 kr (consumption) |
| Card paid in full | net worth unchanged (cash and debt move together) |
| Card overpaid by 2 000 kr | net worth unchanged; card holds a 2 000 kr credit; owed = 0 |
| Mortgage payment, principal 10 000 + interest 100 | net worth −100 kr |
| Same interest, nine times the principal | net worth −100 kr again — principal is neutral |
| Vehicle loan repaid in full | net worth −(final interest) only; row owes 0, holds no credit |
| Income, expense, investment transfer, depreciation | +10 000 / −10 000 / 0 / −10 000 kr |

The debt surface is checked for internal coherence in the same test: per-account owed
magnitudes sum to what the oracle says is owed, and `owed − credit` equals the signed
total that net worth subtracts.

### 3. Running stack — `scripts/financial-oracle.py`

Drives the real HTTP API against the seeded demo household and reads Postgres directly for
truth. This is the test RT2-001 would not have survived: it requires **five surfaces plus
the oracle** to agree.

```
python3 scripts/financial-oracle.py
```

| Check | Meaning |
|---|---|
| `ORACLE-000` | every account type the household has is classified — an unknown type is a failure, not a skip |
| `ORACLE-001…005` | dashboard, `/net-worth`, the history series' final point, the metric registry `net_worth`, and the AI `get_net_worth` tool each equal the oracle |
| `ORACLE-006…008` | cash, investments and the signed liability component equal the oracle |
| `ORACLE-009` | `/debt` total is the signed position net worth subtracts |
| `ORACLE-009b` | per-account owed magnitudes equal the sum of positive liability positions |
| `ORACLE-009c` | `owed − credit = total`, so display rows reconcile with the economic total |
| `ORACLE-010` | vehicle equity = valuation − loan balance − selling cost |
| `ORACLE-011` | monthly cash spending equals the expense-ledger oracle |
| `ORACLE-012` | monthly income equals the income-ledger oracle |

---

## Two definitions the oracle had to make explicit

**Debt total is signed, per-account debt is a magnitude.** `debt_total` and the net worth
liability component are the same signed number, so `net_worth = cash + investments +
assets − debt_total` holds exactly. A card in credit therefore *reduces* the total. The
rows a user reads show what each account owes, clamped at zero, with any credit shown
separately — and `owed − credit = total` keeps the page honest. Before this remediation the
registry described `debt_total` as an "absolute sum"; that text was corrected along with
the arithmetic.

**Spending is cash spending, not economic cost.** Vehicle depreciation debits the expense
book against an asset credit: it lowers net worth but no money moves. It is therefore
absent from `thisMonth.spending`, and the oracle counts only expense postings whose event
also touched a cash account or a card — recognising a payment by its economics rather than
by an event-type label. On the demo seed the difference is the 109 000 kr July
depreciation.

---

## Demo baseline

Recomputed independently from the current deterministic seed rather than carried over from
the audit:

```
asOf 2026-08-01
cash                    108 691 100
investments             118 000 000
assets                  708 000 000
liabilities (signed)    384 899 732   (mortgage 367 000 000 + car loan 19 500 000
                                       − card credit 1 600 268)
independent net worth   549 791 368
```

All five surfaces report `549 791 368`. The audit's figures (`546 634 232` product,
`549 834 768` independent) belonged to the seed as it stood then; the difference is seed
and migration movement since, which is exactly why the expected value is derived and not
hardcoded.

---

## Adding to the oracle

1. Write the expectation as arithmetic over positions you chose. If you find yourself
   calling a product function to obtain it, stop.
2. Prefer a hand-computed constant *and* a locally written oracle function, and assert they
   agree. Two independent derivations catch a typo in either.
3. If a surface legitimately reports something different, the difference is a definition
   and belongs in this document — not in a tolerance.
