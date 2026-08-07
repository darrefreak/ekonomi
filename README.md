# Family Financial OS

Ett komplett ekonomiskt operativsystem för hushållet — inte en vanlig budgetapp.

Systemet samlar, analyserar, prognostiserar och optimerar privatekonomi med deterministiska beräkningar och AI som förklarar, jämför och prioriterar.

## Status

**Phase 0 — Architecture** (pågående / dokumentation)

Implementation startar först efter godkänd Phase 0-rapport och explicit `START PHASE 1`.

## Dokumentation

| Dokument | Beskrivning |
|---|---|
| [PRODUCT_SPEC](docs/PRODUCT_SPEC.md) | Produktprinciper och V1-scope |
| [DOMAIN_INVARIANTS](docs/DOMAIN_INVARIANTS.md) | Absoluta domänregler |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Systemarkitektur |
| [DATA_MODEL](docs/DATA_MODEL.md) | Domän- och datamodell |
| [METRICS](docs/METRICS.md) | Metric registry och definitioner |
| [UI](docs/UI.md) | Informationsarkitektur och UX |
| [SECURITY](docs/SECURITY.md) | Säkerhetskrav |
| [THREAT_MODEL](docs/THREAT_MODEL.md) | Hotmodell |
| [COMPLIANCE](docs/COMPLIANCE.md) | Regulatoriska gränser |
| [PRIVACY_MODEL](docs/PRIVACY_MODEL.md) | Hushålls- och medlemsintegritet |
| [DATA_RETENTION](docs/DATA_RETENTION.md) | Retention och rådata |
| [ROADMAP](docs/ROADMAP.md) | Faser och gates |

ADR:er finns under [`docs/adr/`](docs/adr/).

## Principer (kort)

1. Externa källor är inte den primära ekonomiska modellen.
2. Deterministiska funktioner producerar siffror; AI förklarar och rekommenderar.
3. Pengar representeras som `amountMinor: bigint` — aldrig JS `number`/`float`.
4. All ekonomisk logik lever i `packages/financial-engine` (ingen React/Nest/DB).
5. Alla frågor är household-scoped.

## Kommande kommandon (från Phase 1)

```bash
pnpm install
pnpm dev
docker compose up -d
```

Se [ROADMAP](docs/ROADMAP.md) och [PHASE_1](docs/phases/PHASE_1.md).
