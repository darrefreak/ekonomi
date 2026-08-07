# ADR-0007: Household Privacy

## Status

Accepted (Phase 0)

## Context

Flera vuxna i ett hushåll har både gemensam och personlig ekonomi. Roller räcker inte för att skydda personliga merchants/transaktioner samtidigt som net worth ska kunna aggregeras.

## Decision

Kombinera:

1. Household membership + role  
2. Per-entity / per-account **access policy**: FULL_DETAILS | AGGREGATES_ONLY | BALANCE_ONLY | OWNER_ONLY | CUSTOM  

Projection layer i API filtrerar fält baserat på viewerContext.

Personliga konton kan bidra till household aggregates utan radnivåexponering.

Lifecycle: leave/revoke/separate ownership/historical report behavior dokumenteras i PRIVACY_MODEL och måste stödjas i datamodellen (owner tags, policy table, audit).

## Consequences

- Varje känslig query kräver membership + policy check.
- AI tools tar viewerContext.
- Tester ska täcka IDOR och cross-member leakage.

## Alternatives considered

- “All adults see everything” — rejected.
- Separate apps per person without household rollup — rejected (product is household OS).
