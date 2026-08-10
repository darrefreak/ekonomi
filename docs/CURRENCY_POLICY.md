# Currency policy — V1

**Status** Decided, 2026-08-09, as part of the FPR invariant remediation.

## The decision

**V1 has one financial currency per household, and that currency is SEK.**

Two capabilities were being conflated. The domain can *represent* several
currency codes — `CurrencyCode` is `SEK | EUR | USD | NOK | DKK`, and a bank
feed may well describe a transaction in another one. Being able to *total a
household* in a currency is a different thing, and it requires an FX engine
that V1 does not have. Without one, adding an account in another currency to a
household's net worth means inventing a rate.

So the product supports exactly one aggregation currency, and offers exactly
that one:

```ts
export const AGGREGATION_CURRENCIES = ["SEK"] as const;
```

The list lives in `packages/schemas/src/common.ts` so the API contract, the
runtime guards and the UI all read the same value. Adding a second entry is a
deliberate act that will fail loudly everywhere that is not ready for it.

## Why not dynamic single-currency households

The brief allowed a second model: any single currency per household, with every
downstream surface following it. The backend was already close — around thirty
services resolve `household.baseCurrency` rather than assuming SEK. The UI was
not: the account form was hard-wired to SEK, `moneyToJson` casts to `"SEK"` in
several places, and no screen had ever been rendered against a household in
another currency.

Half-supporting it is what caused FPR-001. Onboarding offered EUR and NOK, the
account form submitted SEK regardless, and the backend guard refused the
mismatch — so a household created through the normal product path could never
hold an account, and base currency was not editable, so there was no way out.
The choice here is between honestly supporting one currency and dishonestly
appearing to support five. V1 supports one.

## Where the rule is enforced

Each boundary asks the same question, so no single bypass is enough.

| Boundary | Enforcement |
|---|---|
| HTTP contract | `createHouseholdSchema.baseCurrency` accepts only `AGGREGATION_CURRENCIES`; a direct call with `EUR` is a `400` before any handler runs |
| Household creation | `HouseholdsService.create` calls `assertSupportedHouseholdCurrency`, so seeds, jobs and tests are held to it too |
| Account creation | `AccountsService.create` calls `assertAggregatableCurrency`, which checks the household's currency is supported *and* that the account matches it |
| Ledger persistence | `assertPostingCurrencyInvariant`, called inside the transaction in `persistBalancedEvent` and `reviseEventEconomicMeaning` |
| Aggregation | `partitionByAggregationCurrency` keeps a non-matching account out of the totals and names it in the dashboard warning |
| UI | onboarding states SEK; the account form reads the household's own currency via `useHouseholdCurrency` rather than assuming one |

The ledger boundary is the one that matters most. Eleven endpoints can build a
ledger draft, and every one of them took the posting currency from its own
request body (`input.currency ?? "SEK"`) without ever comparing it with the
account. Guarding each endpoint would leave the twelfth unguarded, so the check
runs where the postings are actually written — one place that no caller can go
around, including importers, jobs and seeds.

## Quarantine: accounts that already hold another currency

An account whose currency is not the household's cannot be created any more, but
rows created before the guard still exist. Such an account is **quarantined**:

| Allowed | Refused |
|---|---|
| viewing it | income |
| archiving it | expenses |
| metadata correction (name, provider) | transfers in or out |
| appearing in the dashboard's "excluded from totals" warning | any ledger mutation |

Refusal is `409 ACCOUNT_CURRENCY_QUARANTINED`.

Excluding it from the totals while letting it receive money was the other half
of the previous failure (FPR-002): the money landed on an account no total
included, so the household's income statement moved while its balance sheet did
not, and the posting was written in the household's currency onto an account
holding another — breaking `ACC-005`, the ledger's own currency invariant.
Read-only is the only consistent answer short of an FX engine.

Archiving is the remediation, and it works: an archived account is out of the
totals, out of the warning, and still refused for writes.

## Remediation for a household in the wrong currency

`POST /api/v1/households/:householdId/base-currency` moves a household onto a
supported currency. It is OWNER-only and allowed **only while the household
holds no money** — no open non-system accounts and no ledger postings.

If the household does hold money the call returns `409
CURRENCY_MIGRATION_UNSAFE` and says what must be cleared first. This is
deliberate: changing the label on an account holding 100 EUR would turn it into
100 SEK, which is an exchange rate of 1.0 that nobody chose. The product will
not re-denominate money it cannot convert.

`GET /api/v1/households` reports `currencySupported` per household so the client
can show the way out rather than letting the participant discover the problem by
failing to create an account.

## What would change if FX arrives

This policy is a V1 constraint, not an architectural one. An FX engine would
need, at minimum: a rate source with as-of semantics, a decision about which
rate a historical posting is converted at, and a presentation currency separate
from each account's own. Until all three exist, `AGGREGATION_CURRENCIES` stays
at one entry.

## Verification

- `scripts/pilot/currency-invariant.py` — the full matrix over HTTP: household
  creation in four unsupported currencies, account creation, ledger writes onto
  a quarantined account, both directions of a cross-currency transfer, archived
  accounts, and the migration path in both its allowed and refused forms.
- `apps/api/src/db/posting-currency-guard.integration.test.ts` — the same rule
  at the persistence boundary, called directly so no service-level check is in
  the way.
- `apps/api/src/households/currency-invariant.integration.test.ts` — the
  household boundary and the migration rules.
- `scripts/pilot/accounting-integrity.py` — `ACC-005` is the independent check
  that no posting exists in a currency its account does not hold.
