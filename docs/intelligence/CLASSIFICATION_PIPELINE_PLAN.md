# Classification pipeline — plan och utfall

**Datum:** 2026-08-10
**Verdikt: FAIL.** Kedjans första led fungerar; resten är inte byggt.

## 1. Blockeraren är löst

Förra rundan slutade med 0 % klassificerat, och orsaken var att `matchMerchant`
jämför mot merchants hushållet redan har — och ett nyimporterat hushåll har inga.
Länken mellan kluster och merchant saknades.

`packages/financial-engine/src/intelligence/merchant-rules.ts` är den länken: en
liten versionerad katalog över merchants som svensk banktext namnger entydigt, plus
den inferens som gör ett kluster till en kandidat.

**Mätt på riktig importerad historik, AI avstängt:**

| Mått | Före | Efter |
|---|---|---|
| Meningsfullt klassificerade | 0 (0 %) | **195 (47,3 %)** |
| Deterministisk matchning | 0 | **195** |
| Defaultade | 0 | **0** |
| Okända | 412 | **217** |
| Kluster | 11 | 11 |

Noll defaultade är avsiktligt: en transaktion som faller tillbaka på en
standardkategori räknas inte som förstådd, vilket är hela poängen med det korrigerade
måttet.

## 2. Katalogens hållning

Den är liten med flit. Trettio poster, inte tusen. Varje regel kräver *alla* sina
tokens, så "MAX" ensamt blir inte hamburgerkedjan. Två regler som båda matchar ger
`null` i stället för ett myntkast. En ogenomskinlig referens får aldrig en merchant.

Apple och Google fakturerar för helt olika saker genom samma text, så de har hög
merchant-confidence och låg kategori-confidence — de hamnar i granskning i stället
för att arkivera en laptop som ett abonnemang.

En kandidat blir en sparad merchant bara över tröskeln för automatiskt godkännande.
Under den stannar den som ett förslag på klustret.

## 3. Vad som inte är byggt

Learned rules · Apply to similar · Needs Review från kluster · Review-kort ·
Recurring-persistens · Subscriptions · Expected transactions · Transfer candidates ·
**OpenAI-provider** · AI dry-run · AI-cache · BullMQ-pipeline · Category necessity UI ·
Lifestyle creep · Anomalies · Financial Brief V2 · Numeric grounding · Mobilvyer ·
End-to-end-flödet i §55.

Fyra av trettiofyra krav i §57 passerar.

## 4. Nästa steg

1. Needs Review från de okända klustren — 217 transaktioner är sex kluster, alltså
   sex frågor.
2. Learned rules, så en korrigering håller vid omkörning.
3. Recurring-persistens ovanpå klusteridentiteten.
4. Först därefter AI för det som återstår.
