# Financial Intelligence integration — acceptans

**Datum:** 2026-08-10
**Verdikt: FAIL mot acceptanskravet i DEL 65.**

En vertikal skiva är byggd och körd mot riktig importerad historik: likviditets­kravet
räknas nu ur ett hushålls egna månader och syns i produkten. Men merparten av de 39
punkterna i DEL 65 är inte byggda, och det finns ingen AI-provider alls.

---

## 1. Mätt utfall

`scripts/intelligence/acceptance.py` bygger ett isolerat hushåll, importerar ett
syntetiskt SEB-kontoutdrag genom den riktiga importören, kategoriserar det och kör
intelligensen mot det. AI avstängt hela vägen (DEL 53).

```
TOTAL 19  PASS 19  FAIL 0
```

| Fakta | Värde |
|---|---|
| Transaktioner analyserade | **412** |
| Deterministiskt klassificerade | **412 (100 %)** |
| AI-klassificerade | **0** |
| Historik | **23 månader**, 2024-09 → 2026-07 |
| Nödvändigt per månad, median | **20 056 kr**, P90 25 289 kr |
| Rekommenderad likviditet | **71 833 – 105 938 kr** (mitten 83 228 kr) |
| Likviditetens confidence | **MODERATE** (täckning 39 %) |
| Backtest | **17/17 månader klarade, 0 underskott** |
| Normal månadskostnad (12 m) | 27 224 kr |
| Normalt månadsöverskott | 41 435 kr |
| AI-anrop | **0** |

Verifierat i samma körning: hushållets konfigurerade säkerhetsmarginal används
(25 000 kr, inte modellens 5 %), den konfigurerade lägsta kassan är ett golv,
det konfigurerade buffertmålet visas *bredvid* den härledda bufferten utan att
ersätta den, kontobalanser är oförändrade, ledgern balanserar, ett annat hushåll får
403, och en händelse som omklassificeras till `TRANSFER` slutar räknas som utgift.

## 2. Grindar

| Gate | Resultat |
|---|---|
| Build | PASS — 11 tasks |
| Lint | PASS — 18 tasks |
| Typecheck | PASS — 18 tasks |
| Tester | PASS — **500**, 0 fel |
| E2E | PASS — **122**, 0 fel, 11 hoppade (viewport) |
| Docker | PASS |
| Financial oracle | PASS — 12/12 |
| Currency invariant | PASS — 23/23 |
| Erasure invariant | PASS — 14/14 |
| Budget bootstrap | PASS — 17/17 |
| Production secret | PASS — 14/14 |
| Invariant re-acceptance | PASS — 27/27 |

**107 invariantkontroller, 0 fel.**

## 3. DEL 65 punkt för punkt

| Krav | Status |
|---|---|
| Category necessity persistence | **PASS** |
| Category necessity UI | **FAIL** — sätts av migrering och API, ingen vy |
| Recurring cadence expansion | **PASS** |
| Real transaction input service | **PASS** |
| Real spending baseline | **PASS** |
| Real category trends | **FAIL** — motor finns, ej kopplad |
| Real lifestyle creep | **FAIL** — motor finns, ej kopplad |
| Real recurring | **FAIL** |
| Real subscriptions | **FAIL** |
| Real expected transactions | **FAIL** |
| Real anomalies | **FAIL** |
| Real liquidity | **PASS** |
| Safety margin policy | **PASS** |
| Minimum cash floor | **PASS** |
| User buffer comparison | **PASS** |
| Real backtest | **PASS** |
| Real savings target | **PASS** |
| Available surplus | **PASS** |
| Learned rules | **FAIL** |
| Needs Review | **FAIL** |
| BullMQ pipeline | **FAIL** |
| Analysis progress | **FAIL** |
| OpenAI provider | **FAIL** — ingen LLM-provider finns i kodbasen |
| Structured AI classification | **FAIL** |
| AI dry-run | **FAIL** |
| AI failure fallback | **PASS** i praktiken — allt fungerar utan AI, men det är inte en implementerad fallback |
| AI privacy | **FAIL** — inget skickas, men ingen dokumenterad minimering |
| Financial Brief V2 | **FAIL** |
| AI tools | **FAIL** |
| Mobile | **DELVIS** — likviditetssidan är responsiv, inga andra vyer finns |
| Financial oracle / currency / isolation / idempotency | **PASS** |
| Build / Lint / Typecheck / Tests / E2E / Docker | **PASS** |

Tolv PASS, tjugo FAIL, en delvis. Verdiktet är därför FAIL.

## 4. Fel som integrationen hittade

**Tomma månader lästes som månader hushållet levde på noll.** Serien spänner från
första till sista aktivitet, och en månad utan registrerad aktivitet lagrades som en
äkta nolla. Med tre fyllda månader i ett spann på 52 blev medianen noll och sidan
visade ett självsäkert intervall byggt på ingenting. Hittat genom att titta på den
renderade sidan — den sa "median av 52 månader" och "Räcker: –" — inte i ett test.
Månader utan aktivitet räknas inte längre, och antalet redovisas.

**Min egen acceptansprobe påstod något den inte prövade.** Den hävdade att den
konfigurerade säkerhetsmarginalen användes, men ett nyregistrerat hushåll har ingen
inställningsrad, så det fanns ingen marginal att respektera och motorn föll korrekt
tillbaka på 5 %. Proben sätter nu policyn genom produktens eget API först, vilket
också bevisar rundturen.

## 5. Vad detta inte påstår

Kedjan är byggd för **likviditet, baslinjer och sparmål**. Recurring,
subscriptions, trender, lifestyle creep, anomalier och expected transactions har
testade motorer men läser inte hushållets data ännu.

Det finns **ingen AI någonstans i det som är byggt**, och det är avsiktligt: DEL 53
kräver att systemet är användbart utan AI, och 100 % av transaktionerna i
acceptanskörningen klassificerades deterministiskt. Men det betyder också att DEL
31–38 är helt ogjorda, och att en provider måste byggas från grunden — det finns
ingen att koppla in.

Beräkningen sker per anrop, inte via jobb. Det räcker för 23 månader men är inte den
BullMQ-pipeline DEL 39 bad om.
