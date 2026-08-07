# Privacy Model — Family Financial OS

## 1. Problem

Household roles (OWNER/ADMIN/ADULT/VIEWER/CHILD) räcker **inte**. Ett hushåll har både gemensam och personlig ekonomi.

Exempel: ett personligt konto ska kunna bidra till household net worth utan att andra ser merchant, exakt transaktion eller beskrivning.

## 2. Access policies (personlig data)

Utöver roll:

| Policy | Effekt |
|---|---|
| `FULL_DETAILS` | Ser belopp, merchants, beskrivningar, dokumentlänkar |
| `AGGREGATES_ONLY` | Ser kategori-/periodaggregat, inte radnivå |
| `BALANCE_ONLY` | Ser saldo/bidrag till aggregates, inte transaktioner |
| `OWNER_ONLY` | Endast ägaren (och eventuellt OWNER-roll enligt regel) |
| `CUSTOM` | Fingranulära regler (extension point) |

Default-riktning för personliga konton: andra vuxna kan vara `AGGREGATES_ONLY` eller `BALANCE_ONLY` tills ägaren öppnar upp.

## 3. Ownership dimensions

Systemet skiljer:

- personliga konton vs gemensamma konton
- personliga tillgångar vs gemensamma tillgångar
- personliga skulder vs gemensamma skulder

Ändå kan hushållet sammanställas totalt för metrics där policy tillåter bidrag.

## 4. Contribution without exposure

Pipeline:

```
Personal source data
  → ledger (household-scoped, with owner tags)
  → metrics engine (can include amounts in aggregates)
  → API projection layer (strips forbidden fields per viewer)
  → UI
```

**Regel:** Authorization sker i API/projection — inte “hoppas på att UI gömmer fält”.

## 5. Lifecycle events (designkrav)

Modellen måste stödja:

| Event | Effekt |
|---|---|
| Medlem lämnar hushåll | Access revoke; refresh tokens ogiltiga |
| Åtkomst återkallas | Omedelbara policy/role updates |
| Personlig data separeras | Export/move/delete paths |
| Gemensamt ägande förändras | Ownership shares + audit |
| Historiska rapporter | Snapshots behåller dåtidens beräkning; live views respekterar ny access |

Historiska rapporter får inte i onödan “läcka framåt” personliga detaljer till nya medlemmar utan policy.

## 6. Children / VIEWER

- CHILD: starkt begränsad; ingen tillgång till andras personliga detaljer; begränsade belopp/insights enligt settings.
- VIEWER: read-only inom tillåtna policies.

## 7. AI & privacy

AI tools måste få `viewerContext` (memberId + policies). Tools returnerar endast data viewern får se. Prompt/context får inte injicera andras FULL_DETAILS.

## 8. User rights (design)

Användaren ska senare kunna:

- exportera data
- radera household
- radera source
- radera document
- radera personliga data
- återkalla household access

Data ownership designas därefter (household vs personal owner tags).

## 9. Audit

Ändringar av privacy policies, medlemskap och export/delete loggas.

Se [ADR-0007](./adr/0007-household-privacy.md).
