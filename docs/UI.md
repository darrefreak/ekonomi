# UI — Family Financial OS

## 1. Design language

Känsla: premium, lugnt, pålitligt, modernt, finansiellt, minimalistiskt, mänskligt.

Inspireras konceptuellt av Apple / Linear / Stripe / Revolut / modern private banking — **kopiera inte**.

### Undvik

Crypto-dashboard, neon, för mycket gradients, graföverbelastning, developer UI, råa tabeller, gigantiska cards, för mycket borders, steril enterprise UI.

## 2. Layout shells

| Viewport | Shell |
|---|---|
| Desktop | Sidebar + content |
| Mobile | Bottom navigation + kompakt header |

### Mobile bottom nav

Home · Money · Plan · Insights · More

### Desktop navigation

- Overview
- Money → Transactions, Accounts, Cashflow, Budget
- Wealth → Net Worth, Investments, Assets, Debt, Vehicles
- Planning → Forecast, Goals, Scenarios, Vehicle Plan
- Optimize → Insights, Savings, Subscriptions, Contracts, Opportunities
- Risk → Financial Health, Risk Analysis
- Documents → Financial Inbox
- Connections → Integrations, Imports
- AI → Financial Advisor
- Settings

## 3. Mobile-first regler

- Designa först för ~375 px
- Ingen normal horizontal scrolling
- Tabeller → cards/listor på mobil
- Touch targets ≈ minst 44 px
- Sticky actions / bottom sheets där naturligt
- Viktiga siffror ovanför fold där möjligt

## 4. Design tokens

`packages/design-tokens` — light + dark.

Semantic: surface, surfaceMuted, surfaceElevated, border, borderStrong, textPrimary, textSecondary, textMuted, positive, negative, warning, info, accent.

Färg har funktion. Utgifter ska **inte** aggressivt vara röda överallt.

Typography: ekonomiska siffror med **tabular numerals**. Siffran primär, förklaring sekundär.

## 5. Progressive disclosure

Visa inte allt samtidigt. Exempel: Housing total → breakdown → mortgage detail (principal, interest, rate, balance, history, forecast).

## 6. Contextual explanations

Termer (savings rate, cash runway, debt ratio, liquidity risk, net worth, fixed cost ratio, …) har info-icon med:

- enkel förklaring
- formel
- eventuella antaganden

Insights: “Why am I seeing this?” med underlag.

## 7. Dashboard (viktigaste vyn)

Får inte bli överlastad. Widget architecture förbereds (flytta/gömma/resize senare); V1 fixerad layout.

### Innehåll (ordnat)

1. Greeting (“Good afternoon” / sv-motsvarighet)
2. Financial position — Net worth, Available cash, Investments, Debt
3. This month — Income, Spending, Savings, Savings rate, Budget remaining
4. Cash runway
5. Cashflow forecast (30/60/90)
6. AI Financial Brief (3–5 observationer)
7. Upcoming (bills, salary, tax, insurance, loans, subscriptions, planned)
8. Opportunities (kompakt)
9. Vehicle widget (döljs om inget fordon)

### Aggregated API

Dashboard ska använda `GET /api/v1/dashboard` — inte ~30 anrop.

### Quick actions

Add transaction/asset/liability/vehicle/planned expense, create goal, run scenario, ask AI, add data source. Mobil: FAB/bottom sheet.

## 8. Component architecture (riktning)

```
components/
  financial/   MoneyValue, PercentageChange, MetricCard, AccountCard,
               TransactionRow, RiskBadge, ConfidenceBadge, CoverageBadge,
               InsightCard, OpportunityCard, ForecastChart
  vehicle/     VehicleCard, VehicleCostSummary, VehicleTcoBreakdown,
               VehicleValuationRange, VehicleCandidateCard,
               VehicleFitSummary, VehicleRecommendationCard
  layout/      DesktopSidebar, MobileNavigation, AppHeader, PageHeader
  feedback/    EmptyState, ErrorState, LoadingState, Skeleton
```

## 9. Routes (app shell i Phase 1+)

Minsta uppsättning routes (placeholders OK tidigt):

`/`, `/transactions`, `/accounts`, `/accounts/[id]`, `/cashflow`, `/budget`, `/net-worth`, `/investments`, `/assets`, `/debt`, `/forecast`, `/goals`, `/scenarios`, `/insights`, `/opportunities`, `/subscriptions`, `/contracts`, `/risk`, `/documents`, `/integrations`, `/imports`, `/advisor`, `/review`, `/settings`,

Vehicles: `/vehicles`, `/vehicles/[id]`, `.../costs`, `.../maintenance`, `.../valuation`, `.../replacement`, `/vehicles/market`, `/vehicles/candidates`, `/vehicles/compare`.

## 10. Key screens (beteende)

### Transactions
Snabb lista: search, filter, date, account, category. Group by day. Detail: amount, merchant, category, account, dates, source, classification, notes, tags, related transfer, document, confidence. Användaren kan ändra klassificering.

### Account detail
Balance, available, historical balance, income/expenses/cashflow, recent tx, source, sync/freshness, reconciliation.

### Budget
Simple eller detailed. Budget / Actual / Forecast / Difference + “likely over”.

### Review queue
Extremt snabb: unknown transactions, possible transfers, unknown merchants, document fields.

### Connections
Connection health + freshness + reconnect. Import history.

### Advisor
`/advisor` chat. Länkar till underliggande data. Mock structured tools i tidiga faser.

### Vehicle detail
Estimated value, outstanding debt, net equity, monthly cash outflow, monthly economic cost, cost per mil, depreciation, next service/inspection/insurance, recommendation.

## 11. Charts

Varje chart svarar på **en** fråga. Primära: net worth, cashflow, spending trend, category trend, savings rate, debt, vehicle value/depreciation, vehicle TCO trend. Tooltips ska fungera på mobil.

## 12. States

### Empty
Förklarar vad som saknas + primär CTA (“Add vehicle”, “Add source”).

### Error
Inte “HTTP 500”. Istället: vad misslyckades, att tidigare data finns, last successful sync, [Try again].

### Loading
Skeletons / tydliga loading states, särskilt dashboard.

## 13. Accessibility

WCAG-orienterat: keyboard desktop, synliga focus states, screen-reader labels, kontrast, information inte endast via färg, touch targets, accessible charts.

## 14. Search

Desktop: Cmd/Ctrl+K. Mobile: search icon. Sök: transactions, accounts, merchants, documents, insights, vehicles, settings, integrations, opportunities.

## 15. Onboarding

1. Create household  
2. Choose goals  
3. Currency  
4. Emergency buffer  
5. Optional income  
6. Data setup: Demo / Manual / Future Connection  
7. Load demo or continue

## 16. Copy

V1 primärt svenska. Undvik tekniskt jargong i UI.

Inte: “Transaction reconciliation confidence”  
Utan: “Vi tror att detta är en intern överföring.” + detalj “Confidence 96 %”.

## 17. UI quality bar

Varje vy ska besvara:

1. Vad tittar jag på?
2. Vad är viktigast?
3. Är något fel?
4. Vad kan jag göra härnäst?

Mockdata får **inte** ligga hårdkodad i React-komponenter.
