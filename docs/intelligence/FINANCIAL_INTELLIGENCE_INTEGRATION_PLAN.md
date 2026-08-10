# Financial Intelligence — integrationsplan och utfall

**Datum:** 2026-08-10
**Status:** en vertikal skiva är byggd och körd mot riktig importerad historik.
Resten är inte byggd. Avsnitt 4 säger exakt vad som är vad.

---

## 1. Kedjan, från motorkrav till skärm

Uppdraget bad om den här kedjan dokumenterad. Så här ser den ut för det som är
byggt:

| Motorkrav | Persisterad källa | Tjänst | Jobb | API | UI |
|---|---|---|---|---|---|
| `monthlyCosts.essentialMinor` | `financial_events.expense_amount_minor` + `categories.necessity` | `FinancialIntelligenceInputService` | — (beräknas per anrop) | `GET /api/v1/intelligence/liquidity` | `/liquidity` |
| `monthlyIncome` | `financial_events.income_amount_minor` | samma | — | samma | samma |
| `liquidCashMinor` | ledgerjusterad position via `HouseholdMetricsService` | samma | — | samma | samma |
| `policy.*` | `household_settings` | samma | — | samma | samma |
| `sinkingFunds` | `sinking_funds` | samma | — | samma | samma |
| `upcomingObligations` | `goals` med måldatum inom 90 dagar | samma | — | samma | samma |
| `coveragePercent` / `dataAgeDays` | befintlig coverage-motor + nyaste händelse | samma | — | samma | samma |
| baslinjer | samma serie | `FinancialIntelligenceService.baselines` | — | `GET /intelligence/baselines` | — |
| sparmål | samma serie + likviditetskrav | `.savingsTarget` | — | `GET /intelligence/savings-target` | — |

**Ingen del av kedjan går via ett jobb ännu.** Beräkningen sker per anrop, vilket
räcker för dagens datamängder (23 månader svarar på under en sekund) men inte är
det uppdraget bad om.

## 2. Den viktigaste designbeslutet: vad som räknas som utgift

Motorn får aldrig se ett negativt bankbelopp och kalla det spending. Indatatjänsten
läser `financial_events.expense_amount_minor`, som ledgern redan sätter till noll
för intern överföring, kortbetalning, investeringsöverföring och amortering.

Att i stället summera negativa belopp hade räknat en överföring mellan hushållets
egna konton som spenderade pengar, och en kortbetalning två gånger — en gång som
köpet och en gång som betalningen. Ett test bevisar det: en händelse som
omklassificeras till `TRANSFER` sjunker ur baslinjen.

## 3. Två fel som integrationen avslöjade

**Kategorinödvändighet är en egen dimension, inte `kind`.** `kind` säger
expense/income/transfer; nödvändighet säger hur undvikbar kostnaden är. Att lägga
den i `kind` hade blandat två orelaterade frågor. Systemstandarder sätts bara där
hushållet inte själv bestämt, så migreringen kan aldrig skriva över ett val.

**Tomma månader lästes som månader hushållet levde på noll.** Serien spänner från
första till sista aktivitet, och en månad utan registrerad aktivitet lagrades som en
äkta nolla. Det är rätt för ett hushåll som verkligen inte spenderade något, och fel
för ett med gles historik: med tre fyllda månader i ett spann på 52 blev
mediankostnaden noll, och sidan visade ett självsäkert intervall byggt på ingenting.
Upptäckt genom att titta på den renderade sidan, inte i ett test — den sa "median av
52 månader" och "Räcker: –". Månader utan aktivitet räknas nu inte, och antalet
redovisas i confidence-skälen.

## 4. Vad som är byggt, och vad som inte är det

**Byggt och kört mot riktig importerad historik (19 acceptanskontroller):**

- Kategorinödvändighet: enum, kolumn, systemstandarder, migrering (DEL 2)
- Kadensutvidgning: `BIWEEKLY`, `EVERY_4_WEEKS`, `SEMIANNUAL`, `ANNUAL`,
  `VARIABLE_RECURRING` (DEL 4)
- Indatatjänst som läser riktiga hushållsdata (DEL 5, 6, 8)
- Likviditetskrav kopplat till verklig historik och hushållets policy (DEL 12–14)
- Backtest utan look-ahead mot hushållets egna månader (DEL 19)
- Sparmål och tillgängligt överskott ur samma modell (DEL 20, 21)
- Baslinjer ur riktiga månader (DEL 9)
- API-rutter (delar av DEL 43)
- Likviditetssida med komponenter, stress, backtest, motståndskraft och grund
  (DEL 44)
- Kontobalanser orörda, ledgern balanserar, hushållsisolering (DEL 7, 62)

**Inte byggt:**

- Kategorinödvändighet i UI (DEL 2, sista biten) — den sätts av migreringen och
  API:t, men det finns ingen vy där hushållet ändrar den
- Clustering och learned rules mot persisterade transaktioner (DEL 22, 23, 29, 30)
- Recurring- och subscription-persistens (DEL 24–27)
- Needs Review-koppling (DEL 28)
- **OpenAI-provider och all AI-klassificering** (DEL 31–38) — det finns ingen
  LLM-provider i kodbasen alls, så det är att bygga från grunden
- BullMQ-pipeline (DEL 39–42)
- Kategori-, subscription-, review-, savings-vyer (DEL 45–48)
- Financial Brief V2 (DEL 49)
- AI-verktyg (DEL 50)
- Mobilvyer utöver att likviditetssidan är responsiv (DEL 51)
- Lifestyle creep, kategoritrender och expected transactions mot riktig data
  (DEL 10, 11, 27) — motorerna finns och är testade, men är inte kopplade

## 5. Nästa steg, i beroendeordning

1. Kategorinödvändighet i UI, så hushållet kan rätta klassificeringen.
2. Clustering och learned rules, vilket är det som gör Needs Review kort.
3. Recurring-persistens — kadensen kan nu lagras, så detektionen kan sparas.
4. Först därefter är recurring, subscriptions och expected transactions möjliga i
   produkten, och först då är en AI-provider meningsfull: den ska klassificera
   kvarvarande kluster, och klustren finns inte ännu.
