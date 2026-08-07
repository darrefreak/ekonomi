# Product Spec — Family Financial OS

## 1. Vision

Family Financial OS är ett komplett ekonomiskt operativsystem för hushållet. Det är **inte** en vanlig budgetapp vars huvudsakliga jobb är att visa vart pengarna tog vägen.

Systemet ska över tid kunna:

- samla all relevant ekonomisk information
- förstå ekonomiska händelser (inte bara bankrader)
- analysera historik
- prognostisera kassaflöde
- identifiera risker, avvikelser och onödiga kostnader
- analysera skulder, investeringar, tillgångar, fordon, avtal
- planera större utgifter och optimera sparande/investerbart kapital
- följa mål och simulera scenarier
- automatisera administration (observe/recommend i V1)
- fungera som en personlig AI-ekonomichef

## 2. Kärnfrågor systemet ska kunna besvara

1. Hur ser vår ekonomi ut?
2. Vad har förändrats?
3. Varför har det förändrats?
4. Vad kommer sannolikt att hända framåt?
5. Finns någon ekonomisk risk?
6. Vad borde vi göra nu?
7. Vilka beslut ger störst ekonomisk effekt?
8. Vad kan vi förändra utan att försämra livskvaliteten?

## 3. Produktprincip

Vi bygger ett system som hjälper användaren förstå:

- vad som har hänt
- varför
- vad som sannolikt händer härnäst
- vilka risker som finns
- vilka förbättringar som är möjliga
- vad som är ekonomiskt rationellt att göra nu

### AI vs determinism

| Lager | Ansvar |
|---|---|
| Deterministiska ekonomiska funktioner | Producerar siffror |
| AI | Analyserar, sammanfattar, förklarar, jämför, prioriterar, formulerar rekommendationer |

**AI får aldrig vara enda källan för ekonomiska siffror.** All analys ska vara transparent och spårbar till underliggande data och antaganden.

## 4. Version 1 — scope

### V1 bygger

- integrationsarkitektur, adaptergränssnitt, datamodell
- datakällor, importstatus, import batches, raw records
- connector metadata, mock providers, fake sync
- realistisk mockdata och komplett UI-skal
- extension points för framtida riktiga integrationer
- household ledger foundation
- metric registry foundation
- vehicle domain foundation (modeller + engine hooks)
- AI tool-layer contracts (mockade svar i tidiga faser)

### V1 implementerar INTE riktig importlogik mot

Banker, open banking, SEB, SBAB, Revolut, Swish, Avanza, Nordnet, Kivra, Skatteverket, Försäkringskassan, CSN, Transportstyrelsen, fordonsmarknadsplatser, CSV/XLSX/PDF/OCR, email scraping, browser automation, BankID, externa dokumentproviders.

Riktiga integrationer ska kunna kopplas in senare **utan större ombyggnad**.

## 5. Användare och hushåll

### Entiteter

- `User`
- `Household`
- `HouseholdMember`

### Roller

| Roll | Typisk behörighet |
|---|---|
| OWNER | Full kontroll inkl. radering |
| ADMIN | Administrera medlemmar och källor |
| ADULT | Fullt bidragande medlem |
| VIEWER | Läsa enligt privacy policy |
| CHILD | Begränsad vy |

Systemet skiljer personliga vs gemensamma konton/tillgångar/skulder, men kan sammanställa hushållet totalt. Se [PRIVACY_MODEL](./PRIVACY_MODEL.md).

## 6. Primära produktområden (V1-riktning)

1. **Overview / Dashboard** — position, månad, forecast, brief, upcoming
2. **Money** — transactions, accounts, cashflow, budget
3. **Wealth** — net worth, investments, assets, debt, vehicles
4. **Planning** — forecast, goals, scenarios, vehicle plan
5. **Optimize** — insights, savings, subscriptions, contracts, opportunities
6. **Risk** — financial health, risk analysis
7. **Documents** — financial inbox
8. **Connections** — integrations, imports
9. **AI** — financial advisor
10. **Settings** — household, policies, privacy, appearance

## 7. Demo mode

Projektet ska kunna demonstreras direkt via **Load demo household** med deterministisk seed:

- `DEMO_AS_OF_DATE` (default `2026-08-01`)
- `DEMO_RANDOM_SEED` (default `family-financial-os-demo-v1`)

Demo-hushållet: svenskt familjehushåll (2 vuxna + barn), bank/spar/bolån/kreditkort/investeringar/fordon/abonnemang, 18–24 månaders historik.

## 8. Språk och locale

- V1 UI-copy: primärt **svenska (sv-SE)**
- Arkitektur stödjer **en-US**
- Formatering: `12 450 kr`, `7 aug. 2026`, `4,25 %`

## 9. Explicit non-goals (V1)

- Verkliga bankbetalningar eller orderläggning
- Individuell investeringsrådgivning / handelsexekvering
- OCR/parser-produktion
- Marketplace scraping
- Native iOS-app (reserveras som `apps/mobile`)
- LEVEL 3/4 automation (PREPARE/EXECUTE)

## 10. Framgångskriterium (långsiktigt)

Användaren ska kunna få ett lugnt, transparent beslutsstöd i stil med:

> Dina finanser är stabila. Net worth X. Tre saker förtjänar uppmärksamhet…  
> Bilen kostar ca Y kr/mån ekonomiskt. Behålla 18–30 månader ser billigare ut än byte.

Målet är inte fler grafer — utan ett verkligt ekonomiskt beslutsstödsystem.
