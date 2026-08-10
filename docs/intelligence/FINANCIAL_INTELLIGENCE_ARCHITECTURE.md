# Financial Intelligence — arkitektur (V1)

**Status:** V1 under uppbyggnad. Avsnitt 6 anger exakt vad som är byggt och vad som
inte är det — läs det innan du litar på något här.

Byggt ovanpå befintlig arkitektur. Ingen ledgerändring, inga flyttal, ingen AI som
skapar auktoritativa tal.

---

## 1. Vad som redan finns, och återanvänds

Kartlagt genom att läsa koden, inte genom att gissa.

| Finns | Var | Används till |
|---|---|---|
| `merchants/normalize.ts` | `packages/financial-engine/src` | grunden för signaturer och merchant-matchning |
| `lifestyle-creep.ts` | samma | §25, redan implementerad |
| `anomaly.ts` | samma | tre detektorer finns: stor transaktion, dubblett, saknad inkomst |
| `available-to-invest.ts` | samma | §42, byggs om till att läsa likviditetsmotorn |
| `backtest.ts` | samma | prognosnoggrannhet; buffert-backtest är nytt |
| `period-metrics.ts` | samma | `cashRunwayMonths`, sparande, nettoförmögenhetsattribuering |
| `savings-rate.ts` | samma | §47 |
| `coverage.ts` / `freshness.ts` | samma | §52/§53 — confidence ska läsa dessa |
| `metric-registry.ts` | samma + `apps/api/src/metrics` | versionerade, materialiserade mått |
| Ledger + `persistBalancedEvent` | `apps/api/src/db/seed` | all omklassificering som ändrar ekonomisk mening |
| `reviseEventEconomicMeaning` | samma | §68: AI-förslag går genom denna, aldrig direkt insert |
| Job registry | `apps/api/src/jobs` | typade jobb; ett nytt kräver ändring på fyra ställen |
| Review | `apps/api/src/review` | **härledd, inte en tabell** — se nedan |
| SEB-import | `apps/api/src/imports` | källan till materialet som analyseras |

**Två arkitektoniska fakta som styr designen:**

1. **Needs Review är härledd.** `ReviewService.list()` beräknar poster genom att
   fråga `source_transactions`. Det finns ingen review-tabell. Intelligensen måste
   därför uttrycka osäkerhet som *tillstånd på transaktionen*, inte som en egen kö.
2. **Ingen robust statistik finns.** Varken `packages/utils` eller
   `financial-engine` har median, percentiler eller trimmat medelvärde. §21 kräver
   robust statistik, så det byggs — en gång, delat.

## 2. Skiktning

```
source_transactions (importerade, oförändrade)
        │
        ▼
  signature          deterministisk gruppering av banktext        ← §3
        │
        ▼
  merchant match     befintlig normalize + kluster                ← §4
        │
        ▼
  rules              user > system > learned                      ← §5, §6
        │
        ▼
  recurring          periodicitet ur intervall och belopp          ← §14
        │
        ▼
  baselines          median/percentiler per kategori och period    ← §21
        │
        ▼
  liquidity          buffertbehov ur faktisk historik              ← §30
        │
        ▼
  brief              AI formulerar, räknar inte                    ← §50
```

Varje steg är en ren funktion i `packages/financial-engine/src/intelligence/`.
Ingen av dem läser databasen, vilket är varför de kan testas mot syntetiska
hushåll (§63) utan att röra Postgres.

## 3. Var AI får och inte får vara

AI är **enhancement, aldrig infrastruktur** (§54). Konkret:

- Signaturer, merchant-matchning, periodicitet, baslinjer, trender,
  likviditetsbehov, sparmål och avvikelser beräknas deterministiskt. AI deltar
  inte i något av det.
- AI används bara när deterministisk klassificering inte räcker, och då per
  **kluster**, inte per transaktion (§7). 8 184 transaktioner blir några hundra
  signaturer, och det är signaturerna som klassificeras.
- AI-svar valideras med Zod och avvisas om de inte passar schemat (§9).
- AI får aldrig skriva över ett uttryckligt användarval (§6) och aldrig skriva
  till ledger (§68). En föreslagen ändring av ekonomisk mening går genom
  `reviseEventEconomicMeaning`.
- Med AI helt otillgängligt fungerar allt ovan; okända poster går till review.

## 4. Confidence

AI:s egen confidence räcker inte (§10). Den kombineras med deterministiska
signaler: exakt merchant-matchning, användarverifierad regel, historisk likhet,
beloppsbeteende, periodicitet, riktning och urvalsstorlek — och skalas av
`coverage` och `freshness`, eftersom ett hushåll med ett enda importerat konto inte
kan få lika säkra slutsatser som ett med full täckning.

Ändringar som flyttar ekonomisk mening (`EXPENSE → TRANSFER`, `→ INVESTMENT`,
`→ CREDIT_CARD_PAYMENT`, `→ LOAN_PRINCIPAL`) kräver väsentligt starkare evidens än
`Groceries → Restaurant`. Den asymmetrin är avsiktlig: den första kan tysta en
utgift som faktiskt skedde.

## 5. Regelordning

1. Användarverifierad regel för exakt signatur
2. Användarverifierad regel för merchant
3. Deterministisk systemregel
4. Känd merchant-mappning
5. Inlärt hushållsmönster
6. AI-klassificering
7. UNKNOWN → Needs Review

## 6. Vad som är byggt i denna omgång

Detta avsnitt är det viktigaste i dokumentet, och det uppdateras när något
tillkommer. Ett avsnittsnummer nedan syftar på uppdraget.

**Byggt och testat:**

- `intelligence/statistics.ts` — median, percentiler, trimmat medelvärde, MAD,
  robust spridning. Grunden för §21, §33, §34.
- `intelligence/signature.ts` — deterministiska transaktionssignaturer (§3).
- `intelligence/recurring.ts` — periodicitetsdetektion, återkommande typer,
  abonnemang och prisändringar (§14–§17).
- `intelligence/baseline.ts` — spending baselines, kategoritrender,
  drivkraftsanalys, engångsköp (§21–§24).
- `intelligence/liquidity.ts` — likviditetsbehov med komponenter, nödreserv,
  stresscenarier, cash layers, sparmål och vattenfall (§30–§46).

**Inte byggt i denna omgång** — och alltså inte att lita på som levererat:

- AI-klassificering av kluster, dry-run och kostnadsloggning (§7, §70, §56).
- Inlärda regler som persistent tabell (§5) — regelordningen är definierad och
  implementerad som ren funktion, men lagringen är inte gjord.
- Bulk-analysjobb med progress-UI (§11, §12).
- Snabbt review-UI (§13).
- Säsongsanalys (§26) och småköpsanalys (§29).
- Financial Brief V2 (§50).
- Merchant-analyssida (§28).

Läs `FINANCIAL_INTELLIGENCE_ACCEPTANCE.md` för mätta resultat mot riktig
SEB-historik, och för vad acceptansen inte kan påstå.
