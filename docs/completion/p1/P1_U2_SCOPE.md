# P1-U2 Scope — Product Completion (post-U1)

**Date:** 2026-08-08  
**Branch:** `cursor/p1-u2-product-completion-9c58`  
**Base:** `cursor/p1-u1-core-workflows-9c58`

P0 financial core remains protected.

---

## U2 owns

| Item | Why |
|---|---|
| **available_to_invest** | Policies from U1 are unused; METRICS.md formula; dashboard surface |
| **Auth refresh-on-401** | Access JWT TTL short; refresh API exists; client unused |
| **Opportunity estimate labeling** | Heuristic amounts shown as facts; compliance labeling |
| **Sinking fund edit UX** | `updateSinkingFund` client unused |
| **CC / mortgage / investment transfer UX** | Ledger APIs exist; no product forms |
| **Scoped E2E/API tests** | Cover owned flows |

---

## Explicitly deferred (U3+)

- Vehicle purchase UX + seed financed/cash narrative  
- Dark theme application  
- Merchant alias engine  
- Data-driven opportunity models (replace heuristics)  
- Broader jobs catalog beyond reconcile  
- Broad E2E (budget/review/vehicles matrix)

---

## available_to_invest (V1)

```
availableCash
− minimumCashBalance (policy)
− max(0, emergencyFundTarget − current emergency-ish cash reserved)  [simplify: use emergencyFundTarget as buffer floor component]
− safetyMargin
− reservedSinkingFunds (sum of sinking fund current balances, or remaining-to-target reserved)
− upcomingObligations (30d from snapshot)
= max(0, surplus)
```

V1 practical formula (deterministic, documented assumptions):

```
available_to_invest = max(0,
  availableCash
  − minimumCashBalanceMinor
  − safetyMarginMinor
  − emergencyFundTargetMinor   // treated as required buffer still to hold in cash
  − reservedSinkingFundMinor   // sum of sinking_funds.currentBalanceMinor
  − upcoming30dOutflowMinor    // sum of upcoming bill amounts in next 30d
)
```

Always expose: assumptions[], policies used, asOf, coverage/freshness via metricMeta. Not investment advice.
