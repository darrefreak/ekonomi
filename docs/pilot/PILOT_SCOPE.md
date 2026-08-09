# Pilot Scope

**Status** Proposed for the first real-data pilot. Not started.
**Decided** 2026-08-09, as part of OR1 (pilot operational readiness).

## Purpose

Validate Family Financial OS against real household financial data, entered by
hand, without depending on any external integration.

The technical acceptance work is finished: the financial core is verified
against an independent accounting oracle, the currency invariant holds at the
ledger boundary, erasure completes only after the object store confirms the
object is gone, and households are isolated from one another. What none of that
tells us is whether the product is *right* — whether the numbers match what a
household believes about its own money, whether the workflows fit a real month,
and whether the figures stay trustworthy over weeks rather than in a test run.

That is what the pilot is for, and it is the only thing it is for.

## Deliberately small

The first pilot is one household. Not because more would be technically
difficult, but because the blast radius of a mistake should be one household's
data, recoverable from a backup taken that morning.

| | Initial pilot |
|---|---|
| Households | 1 |
| Users | 1 OWNER to start; up to 5 members if the household needs them |
| Base currency | SEK only — the product supports no other, by design |
| Data entry | manual, through the product |
| Documents | uploaded by hand |
| Integrations | none |

## In scope

Everything already built and accepted, used the way a household would:

- checking, savings, credit card, mortgage, investment and cash accounts
- assets and liabilities entered by hand
- ordinary household transactions, income and expenses
- transfers, credit card payments, mortgage payments with principal and interest
- budgets, goals, sinking funds and the planning surfaces
- one or more vehicles, including cost, valuation and replacement analysis
- selected financial documents (receipts, statements, agreements)
- net worth, forecast, insights, the metric registry and the dashboard
- the AI advisor, restricted to its deterministic tools over the household's own data
- export and erasure through Settings → Integritet

## Capability matrix

The state each capability must be in for the first pilot. Where a row says
**absent from the codebase**, it is not a setting someone could turn on by
mistake — the code to do it does not exist. Verified 2026-08-09.

| Capability | Pilot state | How that is true |
|---|---|---|
| Households with real data | 1 | operator discipline, bounded by this document |
| Base currency | SEK only | enforced: `AGGREGATION_CURRENCIES = ["SEK"]`, checked at the schema, the service and the ledger |
| Users | named participants only | registration is open, so the deployment stays off the public internet |
| Manual financial entry | allowed | the pilot's whole point |
| Documents | limited pilot use, ≤ 100 | operator discipline |
| AI | analysis and recommendation only | the advisor calls deterministic read-only tools over the household's own data |
| AI financial execution | **absent from the codebase** | no tool writes a financial event |
| Payments | **absent from the codebase** | no payment execution path exists |
| Investment execution | **absent from the codebase** | no order or execution path exists |
| Trading | **absent from the codebase** | no trading path exists |
| Bank automation | **absent from the codebase** | no real bank client exists |
| BankID | **absent from the codebase** | the only occurrences are `BANKID_MOCK` in the demo seed |
| Browser connectors | **absent from the codebase** | no browser automation exists |
| Real OCR | **absent from the codebase** | documents are stored, never read by machine |
| Real marketplace scraping | **absent from the codebase** | vehicle market data is fixture data |
| External integrations | none | the provider catalogue is `mockProviderCatalog` |
| Demo and mock data | clearly distinguished | the demo household is named `Familjen Demo` and is refused by erasure outside production; mock providers are labelled mock |
| Erasure | two-step, OWNER-confirmed | typing the household name is required; `ADULT` and `ADMIN` are refused |

## Explicitly excluded

Not because they are unwelcome, but because none of them has been through
acceptance and each adds a failure mode the pilot is not equipped to diagnose:

- real SEB or SBAB integration
- BankID automation of any kind
- Kivra collection or scraping
- OCR or document data extraction
- browser automation against any provider
- automatic payments, trading or investment execution
- production marketplace scraping for vehicle data
- native iOS
- more than one pilot household, unless expanded as described below

Mock connectors may be used where they help exercise an import path, and they
must be recognisable as mock data in the product.

## Data limits

Bounds, not capacity limits. The system handles considerably more; these keep
the recoverable surface small and the drills fast.

| | Limit | Why this number |
|---|---|---|
| Households | 1 | one erasure, one restore, one thing to reason about |
| Accounts | 10 | a real household with a mortgage and investments needs about six |
| Transactions | 5 000 | roughly two years of a busy household; well inside measured performance |
| Documents | 100 | object backup and restore stays a seconds-long operation |
| Assets and liabilities | 10 | |
| Vehicles and candidates | 5 | |
| Users | 5 | |

If a limit is reached, that is a finding worth recording rather than a number to
raise quietly.

## Expanding the scope

Scope changes are approved the same way the pilot started: deliberately, in
writing, and never mid-session.

1. Write down what is being added and what new failure mode it introduces.
2. Confirm the addition is covered by existing acceptance evidence, or say
   plainly that it is not.
3. Run `pnpm pilot:preflight` and take a fresh backup before the first use.
4. Record the change and the date at the bottom of this document.
5. A second household, or any real integration, is not a scope expansion. It is
   a new pilot and needs its own acceptance.

## What ends the pilot

Any STOP condition in [`PILOT_RUNBOOK.md`](./PILOT_RUNBOOK.md) halts new data
entry immediately. The pilot itself ends when the household has run a full month
through the product and the figures have been reconciled against their own
records, or when a finding makes continuing pointless.

## Scope changes

| Date | Change | Approved by |
|---|---|---|
| 2026-08-09 | Initial scope defined | pending |
