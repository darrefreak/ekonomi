# Financial Intelligence completion — plan och ärlig status

**Datum:** 2026-08-10
**Verdikt: FAIL.** Det mesta av DEL 111 är inte byggt.

Detta dokument börjar med en rättelse, eftersom uppdraget uttryckligen bad om det.

---

## 1. Rättelse av föregående acceptans

Förra rapporten sa:

> Automatically classified: 412 / 100 %

**Det var fel, och felet var mitt.** Acceptansproben tilldelade själv kategorier med
en SQL-UPDATE och mätte sedan resultatet av sin egen uppdatering. Importören sätter
varken `category_id` eller `merchant_id` — verifierat i koden.

Vad produkten faktiskt klassificerade: **0 %.**

Mätt nu, med produkten tillfrågad först:

| Mått | Värde |
|---|---|
| Transaktioner | 412 |
| Unika signaturer | **11** |
| Merchant-kluster | **11** (0 ogenomskinliga) |
| Meningsfullt klassificerade | **0 (0 %)** |
| Deterministisk matchning | 0 |
| Inlärd regel | 0 |
| AI | 0 |
| Defaultade | 0 |
| Okända | **412** |
| Klustringstid | 142 ms |

## 2. Varför noll, och vad det betyder

Klustringen fungerar: 412 transaktioner blir 11 signaturer, och en omkörning ger
samma 11 kluster i stället för 22. Det är förutsättningen för allt annat.

Men **deterministisk merchant-matchning kan inte lösa något, eftersom det inte finns
några merchants att matcha mot.** `matchMerchant` jämför mot hushållets befintliga
merchant-poster, och ett nyimporterat hushåll har inga. Matcharen vägrar dessutom
medvetet fuzzy-matcha, vilket är rätt — en felaktigt sammanslagen merchant är värre
än en okänd.

Det betyder att merchant-intelligens för ett importerat kontoutdrag kräver ett av
tre, och inget av dem är byggt:

1. Skapa merchant-kandidater ur kluster med tillräcklig evidens.
2. AI-klassificering av kvarvarande kluster.
3. Att användaren namnger dem via Needs Review.

Det är den verkliga blockeraren, och den var osynlig så länge acceptansen mätte sin
egen SQL.

## 3. Vad som är byggt i denna omgång

- Signaturer på persisterade transaktioner, med `signature_version` så algoritmen
  kan ändras kontrollerat (DEL 3, 4)
- `merchant_clusters` med statistik per kluster, unik på
  (hushåll, signatur, version) så omkörning uppdaterar i stället för att duplicera
  (DEL 5, 7)
- Riktning ingår i grupperingsnyckeln, så en återbetalning och ett köp hos samma
  butik inte blandas till ett kluster vars median beskriver ingendera
- Ogenomskinliga referenser klustras var för sig och matchas aldrig mot en merchant
  (DEL 6, 23)
- `classification_source`: `USER_VERIFIED`, `DETERMINISTIC_MATCH`, `LEARNED_RULE`,
  `AI_MATCH`, `DEFAULTED`, `UNKNOWN` — så "klassificerad" inte kan betyda
  "defaultad" (DEL 81, 82, 83)
- En deterministisk matchning skriver aldrig över `USER_VERIFIED` (del av DEL 10)

## 4. Vad som inte är byggt

Allt nedan är FAIL:

Category necessity UI · Learned rules · Apply to similar · Full rule precedence ·
Recurring persistence · 4-week och semiannual roundtrip · Subscription detection ·
Subscription price changes · Expected transactions · Transfer candidates ·
Needs Review-integration · Review-klustring · **OpenAI-provider** · Structured
output · Privacy-minimering · AI dry-run · AI-cache · AI economic-type safety ·
BullMQ-pipeline · Analysis progress · Real spending trends · Lifestyle creep ·
Seasonality · Anomalies · Merchant intelligence UI · Backtest-UI · Savings-UI ·
Financial Brief V2 · Numeric grounding · AI Advisor-verktyg · Dashboard-integration ·
Mobilvyer · End-to-end-flödet i DEL 105.

Sex av ungefär femtio krav i DEL 111 passerar.

## 5. Nästa steg, i beroendeordning

1. **Merchant-kandidater ur kluster.** Utan detta är allt annat blockerat, vilket
   nollan ovan visar.
2. Needs Review matad från okända kluster — 11 kluster är 11 frågor, inte 412.
3. Learned rules, så en korrigering håller.
4. Recurring-persistens; kadensen kan redan lagras.
5. Först därefter är en AI-provider meningsfull: den ska klassificera kvarvarande
   kluster, och kluster finns nu.
