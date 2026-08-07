# ADR-0002: Ledger Architecture

## Status

Accepted (Phase 0)

## Context

Bankrader är inte samma sak som ekonomiska händelser. Interna transfers, kreditkort och bolån måste modelleras utan dubbelräkning eller falsk konsumtion.

## Decision

Använd pipelinen:

```
SourceTransaction → FinancialEvent → LedgerEntry → LedgerPosting
```

Komplettera med TransactionSplit, SourceTransactionLink, ReconciliationGroup, FinancialEventRevision, UserOverride.

### Event types (minst)

INCOME, EXPENSE, TRANSFER, INVESTMENT, LOAN_PRINCIPAL, INTEREST, FEE, TAX, REFUND, REIMBURSEMENT, ASSET_PURCHASE, ASSET_SALE, CREDIT_CARD_PURCHASE, CREDIT_CARD_PAYMENT, ADJUSTMENT, UNKNOWN.

### Invariants (verifierade i Phase 0)

| Scenario | Expense | Net worth effect |
|---|---|---|
| Internal transfer 20k | 0 | unchanged |
| Investment transfer 20k | 0 | unchanged (pre market/fees) |
| CC purchase 2k | 2k | −2k (liability +2k, or equity view) |
| CC payment 2k | 0 | cash−2k, liability−2k → NW unchanged from payment alone |
| Mortgage 18k (10k+8k) | 8k interest | −8k |
| Vehicle cash buy 300k@FV | 0 | unchanged |
| Vehicle depreciation −20k | economic 20k | −20k |

Alla händelser ska kunna postas **balanserat** (summa postings = 0 per entry i ledger currency-regeln).

`currentBalance` på Account är cache; sanning byggs från snapshots + ledger.

## Consequences

- UI får aldrig summera raw bank debits som “spending”.
- Classification/reconciliation jobs blir kritiska.
- financial-engine innehåller pure functions för posting-generation från event types.

## Alternatives considered

- Enkel transaction table som enda modell — rejected (kan inte hantera mortgage split / CC korrekt).
- Full double-entry ERP från dag 1 med kontoklasser à la bokföring — deferred; vi använder household ledger som är double-entry-inspirerad men produktcentrerad.
