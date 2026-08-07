# Data Model — Family Financial OS

## 1. Core identity

### User
Personlig identitet (auth subject).

### Household
Ekonomisk isolationsgräns. All financial data är household-scoped.

### HouseholdMember
Koppling User ↔ Household med roll:

`OWNER | ADMIN | ADULT | VIEWER | CHILD`

Plus privacy policies för personliga data (se [PRIVACY_MODEL](./PRIVACY_MODEL.md)).

## 2. Money type

```ts
type Money = {
  amountMinor: bigint;
  currency: CurrencyCode; // t.ex. "SEK"
};
```

API: `amountMinor` som string. Se [ADR-0001](./adr/0001-money-representation.md).

## 3. Provenance fields (gemensamt mönster)

De flesta ekonomiska entities kan bära:

| Fält | Beskrivning |
|---|---|
| `createdAt` / `updatedAt` | Livscykel |
| `sourceType` | t.ex. MOCK, MANUAL, CONNECTOR |
| `sourceId` | Datakälla |
| `sourceRecordId` | Råpost |
| `importBatchId` | Importkörning |
| `confidence` | 0–1 eller enum |
| `userVerified` | boolean |

## 4. Raw & import layer

### raw_import_records
| Fält | Typ/notering |
|---|---|
| id | UUID |
| provider | string |
| sourceId | FK/ref |
| payload | JSONB (original) |
| receivedAt | timestamptz |
| hash | dedupe |
| processingStatus | enum |
| schemaVersion | string |

### ImportBatch
id, sourceId, startedAt, completedAt, status, totalRecords, created, updated, ignored, failed.

### Duplicate prevention
- provider external ID
- transaction fingerprint
- document hash
- source record hash
- import batch
- reconciliation rules

## 5. Accounts

### AccountType
`CHECKING | SAVINGS | CREDIT_CARD | CASH | INVESTMENT | MORTGAGE | LOAN | TAX_ACCOUNT | PENSION | CRYPTO | OTHER`

### Account fields
name, provider, owner (member/household), currency, accountType, externalReference, source, creditLimit, lastSyncedAt, connectionStatus.

`currentBalance` får finnas som **cache** — inte enda historiska sanningen.

### AccountBalanceSnapshot
accountId, reportedBalance, availableBalance, ledgerCalculatedBalance, reconciledBalance, asOf, source, confidence, userVerified, isEstimated.

## 6. Transactions & ledger

```
SourceTransaction
      ↓
FinancialEvent
      ↓
LedgerEntry
      ↓
LedgerPosting
```

Kompletterande:

- `TransactionSplit`
- `SourceTransactionLink`
- `ReconciliationGroup`
- `FinancialEventRevision`
- `UserOverride`

### SourceTransaction (urval)
id, accountId, externalId, bookingDate, valueDate, amount, currency, originalAmount, originalCurrency, description, rawDescription, merchantId, categoryId, subcategoryId, transactionType, source, confidence, notes, tags, isRecurring, isInternalTransfer, transferGroupId, isExcluded, createdAt, updatedAt.

### Transaction status
`PENDING | BOOKED | REVERSED | CORRECTED | CANCELLED`

Undvik dubbletter mellan pending och booked card transactions.

### FinancialEventType
`INCOME | EXPENSE | TRANSFER | INVESTMENT | LOAN_PRINCIPAL | INTEREST | FEE | TAX | REFUND | REIMBURSEMENT | ASSET_PURCHASE | ASSET_SALE | CREDIT_CARD_PURCHASE | CREDIT_CARD_PAYMENT | ADJUSTMENT | UNKNOWN`

Ledger måste kunna representera exemplen i [DOMAIN_INVARIANTS](./DOMAIN_INVARIANTS.md).

## 7. Merchants & categories

### Merchant
canonicalName, aliases, merchantCategory, logo, website, country, confidence.

Normalisering: `ICA MAXI HANINGE` / `ICA MAXI 1234` / `ICA SVERIGE AB` → samma merchant när möjligt.

### Category taxonomy (flexibel)
Toppnivåer: Housing, Food, Transport, Family, Health, Lifestyle, Finance, Income, Other — med subkategorier enligt produktspec. Användaren kan skapa egna.

## 8. Data sources & connections

### FinancialDataSource metadata
providerId, domain, protocol, authenticationMethod, capabilities.

### DataSourceDomain
`BANKING | INVESTMENTS | TAX | GOVERNMENT | INSURANCE | UTILITIES | VEHICLE | DOCUMENTS | OTHER`

### ConnectorProtocol
`OPEN_BANKING | REST | GRAPHQL | FILE_UPLOAD | EMAIL | BROWSER_AUTOMATION | WEBHOOK | SFTP | MANUAL | OTHER`

### AuthenticationMethod
`OAUTH2 | API_KEY | BANKID_INTERACTIVE | USER_INTERACTIVE | CREDENTIAL_SESSION | FILE_UPLOAD | NONE | OTHER`

### Connection states
`CONNECTED | SYNCING | AUTH_REQUIRED | DEGRADED | ERROR | DISCONNECTED`

Varje källa visar freshness (t.ex. “2 min ago”, “Authentication required”).

### Future connector stubs (metadata only i V1)
SEBOpenBanking, SBAB, Revolut, Swish, Kivra, Skatteverket, Försäkringskassan, CSN, Avanza, Nordnet, Generic CSV/Excel/PDF/Browser, VehicleRegistry, VehicleMarketplace, VehicleValuation.

## 9. Planning & optimization entities

### Budget
Simple (Housing/Food/Transport/Family/Lifestyle/Other) eller Detailed. Visa Budget / Actual / Forecast / Difference.

### SinkingFund
name, category, targetAmount, targetDate, currentReservedAmount, monthlyRequiredContribution, priority, linkedObligations.

### Goal
types: Emergency Fund, Investment Target, Debt Free, Home Purchase, Car, Travel, Education, Custom.  
Fields: target/current amount, target date, monthly contribution, priority.

### Contract
provider, contractType, start/end, bindingPeriodEnd, renewalDate, cancellationDeadline, noticePeriod, monthly/annual cost, priceReviewDate, discountExpiry, autoRenewal, status.

### Subscription (recurring view)
merchant, monthly/annual cost, last charge, first detected, price trend.

### Opportunity
title, description, estimatedAnnualSaving, confidence, effort, risk, priority, dataSources, status, estimatedImplementationCost, nextReviewDate.

### RecommendationOutcome
shownAt, openedAt, acceptedAt, dismissedAt, completedAt, expectedImpact, verifiedImpact, rejectionReason, nextReviewAt.

## 10. Wealth

### Net worth
cash + investments + assets − liabilities.

### Asset types
Home, Real Estate, Vehicle, Company ownership, Valuable item, Other.  
Fields: purchasePrice, estimatedValue, valuationDate, valuationSource, associatedDebt.

### Liability / Loan / Mortgage
balance, rates, fixed/variable, payments, amortization, lender, etc.

### Investments (foundation)
brokerage, ISK, KF, funds, stocks, ETFs, crypto, pension — portfolio value, cost basis, performance, allocation (V1 ej avancerad).

## 11. Forecast & scenarios

### ForecastRun / ForecastPoint / ForecastAssumption
Deterministisk engine. Horizons: 7d, 30d, 60d, 90d, 6m, 12m.

### ForecastActualComparison / ForecastAccuracyMetric
Backtesting foundation.

### Scenario
Simulerar ändringar utan att mutera riktig data (inkomstbortfall, räntehöjning, bilköp, etc.).

## 12. Risk & health

Risk levels: `LOW | MODERATE | HIGH | CRITICAL`.

Dimensions (exempel): liquidity, interest-rate, income concentration, debt, fixed-cost ratio, investment concentration, currency, cash concentration, upcoming liability, tax, insurance gaps, data coverage, vehicle financing, vehicle negative equity, contract renewal.

Financial health visar **dimensioner**, inte bara en score.

## 13. Documents

### Financial Inbox
Statuses: `NEW | PROCESSING | REVIEW | ACTION_REQUIRED | ARCHIVED`  
Types: Invoice, Insurance, Tax, Loan Statement, Annual Statement, Salary, Contract, Receipt, Vehicle, Other.

### DocumentExtractedData
Strukturerade fält (issuer, amounts, rates, renewal, etc.). Ingen riktig OCR i V1.

Dokument = untrusted input. AI arbetar primärt på strukturerat extrakt.

## 14. Vehicle domain

Separata modeller (minst):

Vehicle, VehicleOwnership, VehicleUsageProfile, VehicleFinanceAgreement, VehicleLeaseAgreement, VehicleOdometerReading, VehicleCostEvent, VehicleFuelOrChargeEvent, VehicleMaintenanceEvent, VehicleInspection, VehicleTireSet, VehicleInsurancePolicy, VehicleValuationSnapshot, VehicleMarketListing, VehicleMarketSnapshot, VehicleComparable, VehicleCandidate, VehicleComparison, VehicleReplacementPlan, VehicleRecommendation, VehicleScenario.

### Ownership types
`PRIVATE_OWNED | FINANCED | PRIVATE_LEASE | COMPANY_OWNED | BENEFIT_CAR | SHARED | OTHER` (+ ownership shares).

### Cost taxonomy
PURCHASE_PRICE, DEPRECIATION, LOAN_PRINCIPAL, LOAN_INTEREST, … (full lista i produktspec §73).

### Three cost views
1. Cash outflow  
2. Economic cost  
3. Balance sheet (value − debt − selling costs = equity)

### Valuation
estimatedLow / Mid / High — aldrig ett falskt exakt värde som sanning.

### Market listing
Skilj ASKNING vs verified sale. Inkludera license/permittedUse metadata.

### Ledger link
`vehicleId` på FinancialEvent / TransactionSplit / Document. Kostnad kan delas mellan fordon.

Odometer lagras i **km**; UI visar svenska mil (10 km = 1 mil) i sv-SE.

Engine-funktioner lever i `packages/financial-engine/vehicle`.

## 15. Metrics

MetricDefinition, MetricCalculation, MetricSnapshot — se [METRICS](./METRICS.md).

## 16. Automation & notifications

### Automation levels
LEVEL 1 OBSERVE, LEVEL 2 RECOMMEND (V1). LEVEL 3 PREPARE / LEVEL 4 EXECUTE senare.

### AutomationRule
name, trigger, conditions, action, approvalMode, maximumAmount, enabled, lastRun, nextRun.

### Notification types
`INFO | OPPORTUNITY | WARNING | ACTION_REQUIRED | CRITICAL`

## 17. Audit

who, action, entity, entityId, before, after, timestamp, source, requestId. AI-handlingar loggas också.

## 18. Financial policies (settings)

Minimum cash balance, emergency fund target, safety margin, max fixed-cost ratio, savings rate target, investment contribution target, debt priorities, vehicle monthly cost target, vehicle replacement preferences.

## 19. Persistence rules

- Schemaändringar via **migration**
- Ingen auto schema-sync i production
- Persistent state endast PostgreSQL + object storage
