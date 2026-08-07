# ADR-0001: Money Representation

## Status

Accepted (Phase 0)

## Context

Ekonomiska belopp får inte använda JavaScript `number`/floating point. Avrundningsfel i privatekonomi undergräver förtroende och leder till ledger-obalanser.

## Decision

Representera pengar som:

```ts
type Money = {
  amountMinor: bigint;
  currency: CurrencyCode;
};
```

- SEK lagras i öre (`1234.50 SEK` → `123450n`).
- API-transport: `amountMinor` som **string**.
- Räntor, FX och procent med behov av decimalprecision använder säker decimaltyp (t.ex. decimal.js / proprietary Decimal VO) — inte `number`.
- Rounding policies, currency precision, formatting och conversion centraliseras i `packages/domain` + `packages/financial-engine` / `packages/utils` (formatting).

## Consequences

- Alla serializers/Zod schemas måste hantera string↔bigint.
- UI använder formatters (sv-SE: `12 450 kr`) och visar aldrig rå float.
- Tester i financial-engine låser transfer/mortgage/credit-card exempel.

## Alternatives considered

- `number` med “vara försiktig” — rejected.
- Integer i `number` (öre som float-safe int) — rejected för API/consistency och framtida stora belopp/krypto.
- Alltid string internt — rejected; `bigint` ger aritmetik i engine.
