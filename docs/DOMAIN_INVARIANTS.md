# Domain Invariants — Family Financial OS

Dessa regler **får inte brytas**. Brott är buggar, inte produktbeslut.

## 1. Money

### Förbjudet

- JavaScript floating point för ekonomiska beräkningar
- `number` för monetära belopp

### Representation

```ts
type Money = {
  amountMinor: bigint; // t.ex. öre för SEK
  currency: CurrencyCode;
};
```

Exempel: `1234,50 SEK` → `{ amountMinor: 123450n, currency: "SEK" }`.

### API-transport

`bigint` serialiseras som **sträng**:

```json
{ "amountMinor": "123450", "currency": "SEK" }
```

### Decimalprecision

Räntor, valutakurser och procent som kräver decimalprecision använder säker decimalrepresentation (inte `number`).

### Centraliserat

- rounding policies
- currency precision
- money formatting
- currency conversion rules

Se [ADR-0001](./adr/0001-money-representation.md).

## 2. Ledger

Alla ekonomiska händelser måste kunna representeras **balanserat**.

### Får inte räknas som konsumtion

| Händelse | Korrekt typ | Expense |
|---|---|---|
| Intern transfer (SEB → SBAB) | `TRANSFER` | 0 |
| Investeringstransfer (SEB → Avanza) | `INVESTMENT` / transfer till asset | 0 (före avgifter) |
| Kreditkortsbetalning | `CREDIT_CARD_PAYMENT` | 0 (köpet var expense) |
| Amortering (principal) | `LOAN_PRINCIPAL` | 0 |

### Referensexempel (måste hållas)

#### Internal transfer — 20 000 kr SEB → SBAB

- Expense: 0
- Net worth: oförändrad

#### Investment transfer — 20 000 kr SEB → Avanza

- Cash −20 000, investment asset +20 000
- Expense: 0
- Net worth: oförändrad före avgifter/marknadsrörelse

#### Credit card purchase — ICA 2 000 kr

- Expense: 2 000
- Credit card liability: +2 000

#### Credit card payment — Bank → kort 2 000 kr

- Cash −2 000, liability −2 000
- New expense: 0

#### Mortgage payment — 18 000 kr (principal 10 000 + interest 8 000)

- Cash −18 000
- Debt −10 000
- Expense 8 000 (ränta)
- Debt reduction 10 000
- Net worth −8 000 (allt annat lika)

#### Vehicle cash purchase — 300 000 kr (fair value 300 000)

- Cash −300 000, vehicle asset +300 000
- Expense: 0
- Net worth: oförändrad före fees

#### Vehicle depreciation — 300 000 → 280 000

- Cashflow: 0
- Economic cost: 20 000
- Net worth: −20 000

Se [ADR-0002](./adr/0002-ledger-architecture.md).

## 3. Data isolation

- Alla ekonomiska databasfrågor ska vara **household-scoped**.
- Ingen användare får via ID-manipulation komma åt ett annat hushåll.
- Repositories och API-lager ska kräva `householdId` (eller ekvivalent scope) för känsliga queries.

## 4. Derived data

Alla betydelsefulla härledda metrics ska bära:

| Fält | Syfte |
|---|---|
| `calculationVersion` | Versionshantering av formel |
| `asOf` | Ekonomiskt referensdatum |
| `calculatedAt` | När beräkningen kördes |
| `inputHash` | Där relevant — reproducerbarhet |
| `coverage` | Datatäckning |
| `freshness` | Aktualitet |
| `assumptions` / `assumptionSetId` | Transparenta antaganden |

Samma metric får inte ge olika svar på olika sidor utan förklaring.

Se [ADR-0006](./adr/0006-derived-metrics.md) och [METRICS](./METRICS.md).

## 5. Jobs

Background jobs ska vara:

- idempotenta
- spårbara
- household-scoped
- säkra att köra om
- versionshanterade där beräkningslogiken förändras

Se [ADR-0005](./adr/0005-jobs.md).

## 6. Shared logic boundaries

| Regel | Detalj |
|---|---|
| Ingen ekonomisk domänlogik endast i React | UI formaterar och visar; engine beräknar |
| Ingen ekonomisk domänlogik beroende av Next.js | Shared packages är klientoberoende |
| `packages/financial-engine` får inte bero på | React, Next.js, NestJS, Drizzle, PostgreSQL, Redis |

## 7. Provenance

Ekonomiska entities ska generellt kunna bära:

- `createdAt`, `updatedAt`
- `sourceType`, `sourceId`, `sourceRecordId`
- `importBatchId`
- `confidence`, `userVerified`

Normaliserad data får aldrig vara den enda kopian av importerad källa. Se [ADR-0008](./adr/0008-raw-source-retention.md).

## 8. Data quality dimensions (får inte blandas)

Separera alltid:

1. **Confidence** — säkerhet i klassificering/estimat
2. **Coverage** — hur stor del av ekonomin som finns
3. **Freshness** — hur aktuell datan är
4. **Quality** — dubbletter, luckor, inkonsekvenser, obalanser
5. **Verification** — har användaren verifierat?

Ingen ensam sammanslagen “quality score” som ersätter dessa.

## 9. Asking price vs sale price (vehicles)

Får aldrig blandas:

- `ASKING_PRICE`
- `VERIFIED_TRANSACTION_PRICE`
- `VALUATION_ESTIMATE`

Annonspris får aldrig presenteras som verifierat försäljningspris.

## 10. AI safety invariants

AI får aldrig själv:

- flytta pengar, initiera betalningar
- köpa/sälja investeringar
- ändra bankuppgifter eller kritiska policies
- signera dokument
- genomföra bilköp/-försäljning eller ansöka om finansiering

AI får: analysera, förklara, rekommendera, sammanfatta, simulera, förbereda förslag.

AI får inte fråga databasen godtyckligt — endast via definierade tools.

Dokumentinnehåll är **opålitlig input** (prompt injection-skydd).
