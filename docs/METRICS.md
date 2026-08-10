# Metrics — Family Financial OS

## 1. Metric registry

Varje centralt mått definieras och versionshanteras.

### Entities

| Entity | Syfte |
|---|---|
| `MetricDefinition` | Stabil nyckel, formelbeskrivning, version |
| `MetricCalculation` | Körningsmetadata för en beräkning |
| `MetricSnapshot` | Lagrat resultat vid `asOf` |

### Obligatoriska fält (snapshots / derived)

- `metricKey`
- `version` / `calculationVersion`
- `definition` / `formulaDescription`
- `asOf`
- `period` (där relevant)
- `inputHash` (där relevant)
- `coverage`
- `freshness`
- `calculatedAt`
- `assumptionSetId` / assumptions

**Invariant:** Samma metric får inte ge olika svar på olika sidor utan förklaring (version/asOf/assumptions).

## 2. Quality dimensions (separata)

Metrics och AI ska kunna väga in, men **inte blanda ihop**:

| Dimension | Fråga |
|---|---|
| Confidence | Hur säker är klassificering/estimat? |
| Coverage | Hur stor del av hushållsekonomin finns? |
| Freshness | Hur aktuell är datan? |
| Quality | Dubbletter, luckor, obalanser? |
| Verification | Har användaren verifierat? |

## 3. Financial coverage

Central funktion: **Financial Coverage**.

Exempeldimensioner: bank accounts, savings, credit cards, mortgage, investments, tax account, pension, insurance, CSN, vehicles, etc.

Status per område: present / warning / missing.

AI och metrics ska sänka confidence när coverage är låg.

## 4. Core position metrics

| metricKey | Definition (översikt) |
|---|---|
| `net_worth` | cash + investments + assets − liabilities |
| `available_cash` | spenderbar likviditet enligt policy (ej låst i sinking funds om så konfigurerat) |
| `investments_total` | summa investeringstillgångar |
| `debt_total` | summa skulder |
| `cash_runway_months` | månader utan ny inkomst givet burn + buffer-policy |

### Net worth change attribution

Förklara förändring via: savings, investment performance, debt reduction, asset value changes, currency movements, other.

Perioder: Current, 1M, 3M, YTD, 1Y, All time.

## 5. Savings rate definitions

Exakta definitioner ska kodas i `financial-engine` och dokumenteras här.

### Ingår / undantas (V1 baseline)

| Fråga | V1-regel |
|---|---|
| Vilka inkomster? | Lön + förmåner + regelbundna bidrag (barnbidrag). Kapitalinkomst: **separat** (ingår ej i net savings rate baseline) |
| Skatt? | Net savings rate använder **efter skatt** (net income). Gross savings rate använder bruttoinkomst där tillgänglig |
| Amortering? | Amortering är **inte** expense; räknas som debt reduction. Ingår i `debt_reduction_rate`, inte i “spent” |
| Investeringstransfers? | Inte konsumtion; ingår i `investment_rate` |
| Refunds? | Minskar expense i perioden (netto) |
| Engångsintäkter? | Exkluderas från rolling savings rate baseline; visas separat |

### Beräkna minst

- `gross_savings_rate`
- `net_savings_rate`
- `investment_rate`
- `debt_reduction_rate`

### Rolling windows

3 months, 6 months, 12 months.

## 6. Cashflow & budget metrics

| metricKey | Notering |
|---|---|
| `income_period` | Periodinkomst |
| `spending_period` | Konsumtion (ej transfers/principal/investment transfers) |
| `savings_period` | income − spending (enligt definition) |
| `budget_remaining` | budget − actual (category/group) |
| `budget_forecast` | projected spend vs budget |

## 7. Safe to invest

`available_to_invest` — **inte** investeringsrådgivning.

Exempelberäkning:

```
Cash today
− Upcoming 30d expenses
− Emergency buffer
− Safety margin
− Reserved sinking funds (policy)
= Available surplus
```

Visa alltid: assumptions, policies, forecast horizon, coverage, freshness.

## 8. Debt metrics

- total debt
- monthly payments
- average rate
- interest/year
- principal/year
- debt ratio
- LTV (om data finns, mortgage)

## 9. Risk & health (dimensionella)

Financial health visar status per dimension (Strong / Moderate / Unknown / Excellent etc.), t.ex.:

Liquidity, Cashflow, Debt, Fixed costs, Diversification, Data coverage.

Combined score får finnas men får **inte** ersätta dimensionerna.

## 10. Lifestyle creep

Jämför senaste 3 månader mot tidigare 12 månader (baseline). Framtida justeringar: inflation, one-offs, household composition, life events. Visa drivare.

## 11. Vehicle metrics

Placeras i `packages/financial-engine/vehicle`:

| Funktion / metric | Syfte |
|---|---|
| `vehicle_cash_outflow` | Vad lämnar bankkontot |
| `vehicle_economic_cost` | Verklig ekonomisk kostnad |
| `vehicle_cost_per_km` | Kostnad per km |
| `vehicle_cost_per_swedish_mile` | Kostnad per mil (10 km) |
| `vehicle_fixed_cost` / `vehicle_variable_cost` | Split |
| `vehicle_depreciation` | Värdeminskning |
| `vehicle_net_equity` | value − debt − selling costs |
| `vehicle_negative_equity` | Om skulden > nettoförsäljning |
| `vehicle_projected_tco` | 12/24/36 månader |
| keep vs replace comparison | Intervall + confidence |

### Economic cost formula (grund)

```
depreciation
+ financing interest
+ fees
+ insurance
+ tax
+ inspection
+ service
+ repairs
+ tires
+ energy
+ parking
+ tolls
+ other operating
+ optional opportunity cost
```

Loan principal är **inte** economic cost. Cash purchase är primärt cash→vehicle asset, inte full expense vid köp.

## 12. Forecast metrics

Deterministisk forecasting. AI skapar **inte** prognossiffror.

Inputs: balances, recurring income/expenses, bills, loan payments, tax, historical patterns, planned expenses, sinking funds, user policies.

Backtesting: ForecastRun vs actual → accuracy metrics.

## 13. Opportunity priority model

Ungefär:

```
priority ∝ (financial impact × confidence × ease) / risk
```

## 14. Calculation placement

All formellogik i `packages/financial-engine`. API orkestrerar, persistar snapshots, exponerar via registry. UI renderar endast.

Exempel engine-exports:

`calculateNetWorth`, `calculateSavingsRate`, `calculateCashRunway`, `calculateDebtRatio`, `calculateFixedCostRatio`, `calculateInvestmentCapacity`, `calculateLoanImpact`, `calculateBudgetForecast`, `calculatePeriodComparison`, `calculateLifestyleCreep`, `calculateVehicleTco`, `calculateVehicleCostPerSwedishMile`, `compareKeepVsReplace`.
