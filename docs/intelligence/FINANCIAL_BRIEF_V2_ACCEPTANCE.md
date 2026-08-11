# Financial Brief V2 — acceptans

**Datum:** 2026-08-11
**Verdikt: PASS.** Briefen är en deterministisk pipeline med valfri språklig
förbättring — inte en chattbot. Den fungerar fullt ut med AI av, och AI kan
aldrig ändra en siffra.

Inga privata transaktionsbeskrivningar förekommer i det här dokumentet.

---

## 1. Arkitekturen (§33)

```
deterministisk intelligens
  → strukturerade fynd (packages/financial-engine/src/brief/findings.ts)
  → deterministisk rankning + dubblettdämpning
  → svenska mallar (obligatoriska)
  → valfri AI-prosa, numeriskt jordad
  → validerad slutlig brief, persisterad som snapshot
```

Auktoritativa tal kommer alltid från motorn. Motorpaketet importerar ingen
OpenAI-SDK och ingen databas — AI:n bor i applikationslagret
(`apps/api/src/intelligence/financial-brief.service.ts`).

## 2. Fynden (§34)

14 fyndtyper: `SPENDING_ABOVE_BASELINE`, `SPENDING_BELOW_BASELINE`,
`CATEGORY_INCREASE`, `CATEGORY_DECREASE`, `SUBSCRIPTION_PRICE_INCREASE`,
`NEW_SUBSCRIPTION`, `MISSING_EXPECTED_INCOME`, `UNUSUAL_TRANSACTION`,
`LIQUIDITY_SHORTFALL`, `LIQUIDITY_SURPLUS`, `SAVINGS_RATE_CHANGE`,
`RESERVE_INADEQUATE`, `UPCOMING_LARGE_OBLIGATION`, `DATA_COVERAGE_WARNING`.

Varje fynd bär typ, allvarlighetsgrad, finansiell påverkan i minor units,
konfidens, deterministiska värden, **numeriska fragment** (färdigrenderade
svenska tal som `+14,1 %`, `1 660 kr`), evidenslänk (`explainRoute` +
`explainLabel`) och `asOf`/färskhet.

- **Rankning (§35):** allvarlighetsgrad → påverkan → konfidens,
  deterministiskt och testat för stabil ordning.
- **Dubblettdämpning (§44):** fynd i samma dämpningsgrupp (t.ex. mat-trend +
  restaurang-trend + totala utgifter) reduceras till det starkaste.
- **Urval (§36):** 3–5 poster; täckningsvarningen får aldrig trängas ut.
- **Täckning (§42):** saknade områden (kreditkort, bolån, skattekonto …) blir
  ett synligt `DATA_COVERAGE_WARNING` — rubriken säger aldrig "inga risker"
  förbi evidensen, vilket har ett eget motortest.
- **Färskhet (§43):** inaktuella nulägesfynd (likviditet, kassa) **utelämnas**
  helt i stället för att visas med brasklapp; historiska trender tål äldre data.

## 3. Siffrorna kan inte glida (§39–§40)

Mallarna renderar fragmenten ordagrant. Om AI-prosa är påslagen skickas endast
de rankade strukturerade fynden (aldrig databasen), och varje genererad mening
valideras: alla tal i meningen måste finnas bland fyndets fragment eller
mallens egna tal, med svensk siffergruppering och decimalkomma normaliserad
före jämförelsen. En mening som inte klarar det ersätts av sin mall — per
mening, inte hela briefen.

Regressionstestet för §60 finns i två lager:

- motorn: `"§60 regression: AI may not alter +14,1 % / 1 660 kr"` — utfallet
  `+18 %` avvisas, mallen vinner;
- API-integrationen: `"§60 regression: altered numbers never reach the
  rendered brief"` — via en syntetisk språkprovider mot riktig databas.

## 4. Persistens (§45)

`financial_brief_snapshots`: `asOf`, `inputHash`, `findings-1`,
`brief-templates-sv-1`, generator (`TEMPLATE`/`AI`), ev. `brief-writer-v1` +
modell. Oförändrad indata ger cacheträff — samma `briefId`, ingen
omgenerering per sidrendering. Raderas med hushållet (`CASCADE`).

## 5. Rådgivaren (§46–§48)

AI-rådgivaren är jordad på 15 nya deterministiska verktyg:
`get_spending_baseline`, `get_category_trend`, `get_merchant_trend`,
`get_recurring_summary`, `get_subscription_changes`,
`get_expected_transactions`, `get_missing_expected`, `get_lifestyle_creep`,
`get_anomalies`, `get_liquidity_requirement`, `get_savings_target`,
`get_available_surplus`, `get_financial_resilience`,
`get_period_change_drivers`, `get_financial_coverage`. Inget godtyckligt
SQL-verktyg finns. Buffertfrågan besvaras av likviditetsmotorn, inte av en
modellformel, och svaren länkar tillbaka in i produkten via verktygens
`explainFromTools`-sektioner.

## 6. Bevisen

### 6.1 Motortester (`packages/financial-engine/src/brief/findings.test.ts`)

14 tester: formattering, fyndbyggen med exakta fragment, tröskelvärden (små
avvikelser blir inga fynd), färskhetsutelämning, täckningsvarningens garanti,
deterministisk rankning, dubblettdämpning, 3–5-urvalet, rubrik-ärlighet,
sifferextraktion, §60-regressionen, mall-fallback per mening, samt att varje
fyndtyp har en mall som bara använder givna fragment.

### 6.2 API-integrationstester (riktig databas, syntetisk språkprovider)

6 tester i `financial-brief.integration.test.ts`: mallbrief komplett med AI av
och lugnt statusmeddelande (§37, §50, §61); snapshot-återanvändning (§45);
jordad AI-prosa accepteras (§38); §60-regressionen; döende provider degraderar
till mall, inte till fel (§50, §62); hushållets opt-out håller briefen på
mallar oavsett miljön.

### 6.3 Genom produkten (acceptansskriptet, 24/24)

Isolerat syntetiskt hushåll: mallbrief med rubrik + 3 förklarade poster
(`SPENDING_ABOVE_BASELINE`, `LIQUIDITY_SURPLUS`, `DATA_COVERAGE_WARNING`);
varje post pekar in i produkten; statusraden lyder ordagrant *"Extern
AI-analys är avstängd. Systemets automatiska analys fungerar fortfarande."*;
en snapshot, cacheträff vid andra hämtningen; fyndens numeriska fragment
återfinns ordagrant i de renderade posterna; finansiellt orakel oförändrat;
grannhushåll får 403.

### 6.4 E2E (Docker, chromium + mobil 390×844)

`e2e/ai-brief.spec.ts`: brief-kortet på instrumentpanelen med rubrik, poster
och ärlig AI-status; "Varför ser jag detta?"-länken leder till en riktig sida;
inställningssektionen med den ärliga svenska förklaringen; på/av-växling som
återställer sig; ingen horisontell overflow i något steg. 134 E2E-tester
passerade totalt (11 villkorligt överhoppade, inga inom denna slice).

## 7. Verdikt per krav

Strukturerade fynd PASS · rankning PASS · mallbrief PASS · valfri AI-brief
PASS · numerisk jordning PASS · inga okällade tal PASS · förklarbarhet PASS ·
täckning/färskhet PASS · dubblettdämpning PASS · briefhistorik PASS ·
rådgivarverktyg PASS · rådgivarens numeriska säkerhet PASS · mobil PASS ·
AI-status-UX PASS.
