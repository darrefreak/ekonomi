# OpenAI-klassificering av olösta kluster — acceptans

**Datum:** 2026-08-11
**Verdikt: PASS.** Fallback-klassificeringen finns, är avstängd som standard,
skickar ingenting utan uttryckligt tillstånd, och den deterministiska produkten
fungerar identiskt med AI av.

Inga privata transaktionsbeskrivningar förekommer i det här dokumentet.
Alla siffror är aggregat från en isolerad syntetisk hushållskörning.

---

## 1. Vad som byggdes

| Del | Var | Innehåll |
|---|---|---|
| Provider-gränssnitt | `apps/api/src/ai/classification/provider.ts` | `TransactionClassificationProvider` + `BriefLanguageProvider`, provider-neutrala typer, felkategorier |
| OpenAI-implementation | `apps/api/src/ai/classification/openai-provider.ts` | officiella SDK:n, Responses-API med `json_schema`-tvingad output; ingen Assistants-API |
| Konfiguration | `apps/api/src/ai/classification/ai-config.ts`, `.env.example` | `OPENAI_API_KEY`, `OPENAI_CLASSIFICATION_MODEL`, `AI_TRANSACTION_CLASSIFICATION_ENABLED` (av), `AI_CLASSIFICATION_DRY_RUN` (på), `AI_TRANSACTION_CLASSIFICATION_MAX_CLUSTERS`, `AI_TRANSACTION_CLASSIFICATION_TIMEOUT_MS` |
| Redigering | `apps/api/src/ai/classification/redaction.ts` | deterministisk maskning av personnummer, kort, konton, telefon, IBAN, OCR/långa referenser — LLM:en redigerar aldrig sin egen indata |
| Behörighet + dry-run + routing | `apps/api/src/ai/classification/ai-classification.service.ts` | samma behörighetsmatematik i dry-run och skarpt läge; taxonomisäkerhet; kombinerad konfidens; cache; kostnadsmått |
| Kombinerad konfidens | `apps/api/src/ai/classification/confidence.ts` | modellens självförtroende vägs mot lokal deterministisk evidens; trösklar `0.95` (auto) / `0.75` (förslag) |
| Cache + revision | `ai_classification_results` (migration 0033) | identitet = hushåll + klustersignatur/version + riktning + taxonomiversion + promptversion + schemaversion + provider + modell; `inputHash`, `resultHash`, usage, status |
| Jobb | `AI_CLASSIFY_TRANSACTION_CLUSTERS` (BullMQ) | körs sist i intelligenskedjan; idempotent; fortsätter per kluster vid fel |
| Inställning | `household_settings.ai_transaction_analysis_enabled` | "Extern AI-analys av transaktioner", av som standard, med ärlig svensk förklaring |
| Review-integrering | `classification-review.service.ts`, review-kortet | AI-förslag med handlare, kategori, konfidens, kort motivering, källa "AI-förslag"; Acceptera / Rätta / Kom ihåg regel / Hoppa över |

Versioner som persisteras: prompt `transaction-classifier-v1`, schema
`ai-cls-1`. Ingen rå prompttext lagras.

## 2. Grindarna, i ordning

Ett externt anrop kräver **alla fyra** samtidigt:

1. `OPENAI_API_KEY` satt,
2. `AI_TRANSACTION_CLASSIFICATION_ENABLED=true`,
3. `AI_CLASSIFICATION_DRY_RUN=false`,
4. hushållets egen opt-in i inställningarna.

Varje stängd grind ger samma sak: en ärlig dry-run-rapport och noll trafik.
Statusendpointen (`GET /intelligence/ai/status`) redovisar varje grind separat
tillsammans med kostnadsmåtten (kluster skickade, requests, tokens,
cacheträffar, fel).

## 3. Vad som lämnar systemet

Dokumenterat i detalj i `docs/intelligence/AI_TRANSACTION_PRIVACY.md`.
Sammanfattat: per behörigt kluster en normaliserad, redigerad beskrivning,
2–5 redigerade representativa exempel, riktning, kontotyp, medianbelopp och
intervall, förekomster, kadensevidens, ev. befintlig handlarkandidat, samt den
tillåtna taxonomin (id + namn). Aldrig personnummer, kontonummer, namn,
adresser, anteckningar, saldon eller full historik. Klusterreferensen är en
hash, inte ett databas-id.

Behörighet (§7): endast olösta kluster, efter att systemregler, användar-
verifieringar, inlärda regler och deterministisk evidens har fått försöka.
Referens-/sifferkluster utan semantisk text skickas aldrig (§28).

## 4. Bevisen

### 4.1 Databasbackade integrationstester (syntetisk provider, riktig databas)

15 tester i `ai-classification.integration.test.ts` — ingen request lämnar
maskinen, vilket i sig är en del av beviset:

| § | Scenario | Utfall |
|---|---|---|
| §52 | dry-run: verklig behörighetsmatematik, 0 provideranrop, 0 cache-rader | PASS |
| §53 | hög kombinerad konfidens → handlare appliceras som `AI_MATCH`, ledger orörd | PASS |
| §54 | måttlig konfidens → review-förslag, aldrig applicering | PASS |
| §55 | högriskstyp (`TRANSFER`) → review även vid maximal konfidens; inga transaktioner omskrivna | PASS |
| §56 | påhittat kategori-id → `REJECTED`/`UNKNOWN_CATEGORY_ID`, klustret förblir granskningsbart | PASS |
| §56 | trasigt providersvar → batchen felmarkeras, pipelinen fortsätter, review opåverkad | PASS |
| §57 | uttryckligt `UNKNOWN` → ingenting fabriceras | PASS |
| §58 + §23 | oförändrat kluster besvaras ur cachen; omkörningar idempotenta | PASS |
| §59 | ändrad taxonomiversion ogiltigförklarar cache-svaret | PASS |
| §26 | inlärd regel > AI: rättat mönster löses deterministiskt, AI anropas inte | PASS |
| §27 | användarverifiering > AI: applicerat AI-svar skrivs över av personen, permanent | PASS |
| §29 | tvetydig Apple: säker handlare, osäker kategori → förslag, ingen abonnemangsantagelse | PASS |
| §61 | AI av: classify degraderar till dry-run, allt annat fungerar | PASS |
| §62 | provider nere (timeout/ratelimit): allt står kvar | PASS |
| §8–§9 | payloaden som lämnar är minimerad och redigerad | PASS |

Enhetstester därtill: 10 för redigeringen (mönster + determinism + opacitet),
7 för den kombinerade konfidensen (trösklar, evidensvikter, klämning).

### 4.2 Isolerat hushåll genom riktiga produkten (24/24 checkar)

`scripts/intelligence/ai-acceptance.py`: syntetiskt SEB-utdrag genom den
riktiga importern, klustring, AI-ytor, brief, oracle, isolering, radering.

| Aggregat | Värde |
|---|---|
| transaktioner analyserade | 581 |
| kluster totalt | 12 |
| lösta före AI | 4 |
| olösta kluster | 8 |
| AI-behöriga | 7 |
| opaka exkluderade | 1 |
| uppskattade requests | 1 (batchad) |
| uppskattad payload | ~2 423 byte |
| provideranrop gjorda | 0 |
| Needs Review före AI | 8 |
| Needs Review efter | 8 (oförändrat — inga skarpa anrop) |

Verifierat därutöver: statusendpointens ärlighet per grind; kostnadsmått som
startar på noll; att hushållets samtycke ensamt inte öppnar grinden; noll
cache-rader och noll provideranrops-auditposter efter alla försök; finansiellt
orakel (posteringar och saldon bit-identiska före/efter); hushållsisolering
(403 på samtliga AI-ytor); `CASCADE` på `ai_classification_results` och
`financial_brief_snapshots` vid radering.

### 4.3 Skarpa anrop

**AI real calls: NOT AUTHORIZED.** Ingen `OPENAI_API_KEY` finns i någon miljö
och miljöflaggan är av. §30-testet mot riktiga OpenAI (syntetiska kluster) kan
köras när en uttrycklig integrationsnyckel finns; providerbeteendet är tills
dess bevisat via schemat (samma Zod-kontrakt validerar båda riktningarna) och
den syntetiska providern. Ingen SEB-härledd text har lämnat maskinen.

## 5. Verdikt per krav

Provider-abstraktion PASS · aktuellt API-mönster PASS · strukturerad output
PASS · taxonomibegränsning PASS · privacyminimering PASS · redigering PASS ·
dry-run PASS · behörighet PASS · cache PASS · promptversionering PASS ·
felfallback PASS · konfidensrouting PASS · `AI_MATCH`-källa PASS ·
högrisksäkerhet PASS · review-förslag PASS · inlärd regel > AI PASS ·
användarverifierad > AI PASS · AI-av-läge PASS · kostnadsobservabilitet PASS ·
raderingslivscykel PASS.
