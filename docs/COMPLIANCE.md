# Compliance — Family Financial OS

## 1. Purpose

Detta dokument sätter **regulatoriska gränser** för produkten. Det är ingen juridisk rådgivning; det är en produktarkitekturgräns så att implementationen inte oavsiktligt blir reglerad verksamhet.

## 2. Activity categories

Systemet ska skilja mellan:

| Kategori | Beskrivning | V1 |
|---|---|---|
| Personal finance analytics | Aggregera, visualisera, förklara egen data | ✅ Tillåtet |
| Financial recommendations (generic/policy-based) | “Baserat på din buffer-policy har du X i surplus” | ✅ Tillåtet med transparens |
| Investment recommendations (individual) | Specifika köp/säljråd för värdepapper | ❌ Undvik |
| Account information services (AIS) | Open banking kontodata | ❌ Ej V1 (arkitektur förbereds) |
| Payment initiation (PIS) | Initiera betalningar | ❌ Ej V1 / förbjudet för AI |
| Regulated financial advice | Individuell rådgivning under tillstånd | ❌ Utanför scope |

## 3. V1 permitted posture

V1 stannar inom:

- observe
- analyze
- explain
- simulate
- recommend generic / policy-based actions

### Explicit non-goals

- Individuell handel eller orderexecution
- Automatiska betalningar (LEVEL 4 execute)
- Presentera sig som bank, rådgivare eller fondkommissionär
- Ge “garanti” om framtida avkastning

## 4. Copy & UX constraints

- “Available to Invest” / “Safe to invest” = surplus enligt **användarens policies**, inte investeringsrådgivning. Visa antaganden.
- Vehicle recommendations = ekonomisk jämförelse under antaganden, inte säljpress.
- Opportunity cards ska visa confidence, effort, risk, data sources.
- Forecasts är modellutfall, inte löften.

## 5. AI compliance boundary

AI får rekommendera och simulera men får aldrig:

- flytta pengar
- initiera betalningar
- köpa/sälja investeringar
- ändra bankuppgifter
- signera dokument
- genomföra bilköp/-försäljning
- ansöka om finansiering

Alla AI-handlingar audit-loggas.

## 6. Data protection (high level)

Personuppgifter och ekonomisk data behandlas enligt privacy-design i [PRIVACY_MODEL](./PRIVACY_MODEL.md) och [DATA_RETENTION](./DATA_RETENTION.md). Export/radera-flöden designas tidigt även om UI kommer i senare faser.

## 7. Market data

Fordonsmarknadsdata kräver license/permittedUse. Ingen scraping i V1. Annonspris ≠ verifierat försäljningspris.

## 8. Future gated capabilities

Följande kräver separat compliance review innan aktivering:

- Riktiga open banking AIS-anslutningar
- Browser automation mot banker
- Document OCR på känsliga dokument i molnet
- Push-notiser med känsliga belopp (särskilt lock screen)
- Automation LEVEL 3/4
- Native Face ID / biometric unlock semantics

## 9. Documentation duty

När produktens förmågor närmar sig reglerad gräns: uppdatera detta dokument, ADR:er och feature flags innan kod aktiveras.
