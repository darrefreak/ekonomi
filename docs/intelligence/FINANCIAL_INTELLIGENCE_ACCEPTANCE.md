# Financial Intelligence V1 — acceptans

**Datum:** 2026-08-10
**Verdikt: FAIL mot acceptanskravet i §71.** Motorlagret är byggt och testat, men
det är inte kopplat till produkten, och AI-delen är inte byggd. Ett hushåll ser
ingenting av detta ännu.

Det här dokumentet säger vad som faktiskt gäller, inte vad som var tänkt.

---

## 1. Vad som är gjort

Den deterministiska motorn, som rena funktioner i
`packages/financial-engine/src/intelligence/`. **186 motortester passerar.**

| Modul | Uppdrag | Status |
|---|---|---|
| `statistics.ts` | §21, §33, §34 | median, percentiler, trimmat medelvärde, MAD, nedsidesrisk |
| `signature.ts` | §3 | deterministisk gruppering av banktext, `rawDescription` orörd |
| `recurring.ts` | §14–§20 | periodicitet, återkommande typer, abonnemang, prisändringar, förväntade händelser, saknade händelser |
| `baseline.ts` | §21–§24, §28, §48 | baslinjer, kategoritrender, drivkrafter, engångsköp, merchant-analys, what-changed |
| `liquidity.ts` | §30–§47 | likviditetsbehov med åtta komponenter, nödreserv, stress, backtest, sparmål, vattenfall, runway, motståndskraft |

Property-testerna i §64, den look-ahead-fria backtesten i §65 och det oberoende
sparoraklet i §66 finns och passerar.

## 2. Vad som inte är gjort

Detta är listan som gör verdiktet FAIL, och den är avsiktligt fullständig.

| Uppdrag | Status |
|---|---|
| §5, §6 | Regelordningen är definierad men **inlärda regler lagras inte** |
| §7–§10, §55, §56, §70 | **AI-klassificering finns inte.** Ingen provider, inget schema, ingen cache, ingen dry-run, ingen kostnadsloggning |
| §11, §12 | **Inget bulk-analysjobb**, ingen progress |
| §13 | **Inget snabbt review-UI** |
| §26 | Säsongsanalys saknas |
| §29 | Småköpsanalys saknas |
| §32 | **Kategoriernas essential/discretionary-klassificering saknas** |
| §50 | Financial Brief V2 saknas |
| §57–§59 | **Ingen koppling till jobb, API eller gränssnitt. Inga vyer, ingen mobil.** |
| §69 | **Ingen acceptanskörning mot riktig SEB-historik** |
| §72 | Fem av åtta dokument saknas |

## 3. Varför motorn inte kunde kopplas in

Inte tidsbrist allena: det finns ett konkret beroende i vägen.

Likviditetsmotorn tar `monthlyCosts` med `essentialMinor`,
`semiDiscretionaryMinor` och `discretionaryMinor` per månad. Den uppdelningen är
själva grunden för buffertberäkningen — nödvändiga kostnader är vad en buffert ska
täcka, och att räkna på totala utgifter i stället skulle ge ett systematiskt för
högt tal.

`categories`-tabellen har `kind` (`expense` / `income`) men **ingen
essential/discretionary-klassificering** (§32). Utan den finns det inget sätt att
dela upp ett riktigt hushålls månadskostnader, och motorn kan inte matas med annat
än syntetiska data.

Ordningen för nästa omgång är därför bestämd av beroendet, inte av preferens:

1. §32 — kategoriernas spending class, med användarkorrigering.
2. En tjänst som läser `source_transactions` och producerar motorns indata.
3. `REFRESH_FINANCIAL_INTELLIGENCE` som jobb, API-rutt och en vy.
4. Först därefter är §69 möjlig.

## 4. Vad de 186 testerna faktiskt bevisar

De bevisar att matematiken beter sig rationellt mot syntetiska hushåll (§63) och
att invarianterna i §64 håller. De bevisar **inte** att motorn ger rimliga svar för
det här hushållet, eftersom den aldrig har fått se det.

Fem fel som testerna hittade, och som annars hade nått produktionen:

1. Alla ogenomskinliga referensnummer fick samma signaturnyckel och klumpades ihop
   till ett kluster.
2. Överlappande toleransfönster gjorde ett månadsabonnemang till fyraveckors.
3. Frekvens hävdades från medianintervallet allena, så oregelbundna matinköp fick
   ett projicerat förfallodatum.
4. MAD:en var blind för en inkomst som kollapsar var tredje månad.
5. `comparePeriods` fanns redan; min version skuggade den.

## 5. Vad kartläggningen av befintlig kod hittade efteråt

En genomgång av `recurring`, `subscriptions`, `categories`, AI-lagret och
statistikhjälpare kördes parallellt med bygget och blev klar efter det. Tre fynd
som påverkar arbetet:

### 5.1 Hushållets policy överkördes — åtgärdat

`household_settings` har `safety_margin_minor`, `minimum_cash_balance_minor` och
`emergency_fund_target_minor`. Min likviditetsmotor hårdkodade 5 % marginal och
ignorerade dem — den skrev alltså över ett tal hushållet uttryckligen valt.

Åtgärdat: en konfigurerad säkerhetsmarginal används i stället för modellens 5 %,
och en konfigurerad lägsta kassa behandlas som ett golv som modellen får överstiga
men aldrig underskrida. Den konfigurerade buffertmålsättningen används medvetet
*inte* som reserv — att härleda den ur faktiska nödvändiga kostnader är hela
poängen med §30 — men den redovisas vid sidan av det härledda talet, så att ett
hushåll kan se att dess eget mål ligger under vad två års egna kostnader antyder.
Fyra tester täcker det.

### 5.2 Kadensvokabulären matchar inte tabellen — inte åtgärdat

`recurring_items.cadence` är en PG-enum med fyra värden: `WEEKLY`, `MONTHLY`,
`QUARTERLY`, `YEARLY`. Min motor upptäcker sju: `WEEKLY`, `BIWEEKLY`,
`FOUR_WEEKLY`, `MONTHLY`, `QUARTERLY`, `SEMIANNUAL`, `ANNUAL`, plus `VARIABLE`.

`BIWEEKLY`, `FOUR_WEEKLY`, `SEMIANNUAL` och `VARIABLE` kan alltså inte lagras. Det
är inte ett fel i motorn — fyraveckorsdebiteringar och halvårsförsäkringar är
verkliga och vanliga — utan en lucka i schemat som måste utvidgas innan
detektionen kan sparas. Att i stället tvinga in dem i de fyra befintliga värdena
skulle innebära att en fyraveckorsdebitering lagras som månatlig, vilket ger tretton
betalningar om året i verkligheten och tolv i prognosen.

### 5.3 Statistiken finns i två versioner — medvetet inte sammanslagen

`packages/financial-engine/src/vehicle/market-analytics.ts` har privata
`percentile()` och `median()`. Jag byggde en andra uppsättning i
`intelligence/statistics.ts` utan att känna till dem.

De är **inte utbytbara**. Mätt på verkliga mängder skiljer de sig på jämna antal:
min tar det lägre mittvärdet, fordonsversionens närmaste rang ger det övre. För
`[10, 20, 30, 40]` blir medianen 20 respektive 30. Att låta fordonsmodulen använda
min version skulle alltså ändra fordonsvärderingar i ett accepterat och testat
delsystem, utan att det gagnar det här arbetet.

Duplikationen står kvar, dokumenterad, så att nästa läsare inte "städar" den och
flyttar fordonssiffrorna av misstag. Ett sammanslaget statistikmodul bör vara sitt
eget arbete, med fordonstesterna som grind.

### 5.4 Det finns ingen AI-leverantör att bygga på

§7 säger att första implementationen "kan använda projektets befintliga
AI/OpenAI-provider". Det finns ingen. AI-lagret är deterministisk
verktygssammansättning: `AdvisorToolDef` med `readOnly: true`, och rubriker som är
fasta strängar. Ingen LLM-anropas någonstans i kodbasen.

Det gör §7–§10 större än de ser ut: en leverantör, ett interface, schemavalidering,
cache, dry-run och kostnadsloggning måste byggas från grunden, inte kopplas in.

## 6. Gates

| Gate | Resultat |
|---|---|
| Build | PASS |
| Lint | PASS |
| Typecheck | PASS |
| Tester | PASS — 496 totalt, 0 fel |
| E2E | PASS — 122, 0 fel |
| Financial oracle | PASS — 12/12 |
| Docker | PASS |

Inga tidigare accepterade invarianter är rörda: motorn skriver ingenting, läser
ingenting och är inte inkopplad någonstans.
