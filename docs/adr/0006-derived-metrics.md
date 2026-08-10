# ADR-0006: Derived Metrics

## Status

Accepted (Phase 0)

## Context

Samma “savings rate” får inte betyda olika saker på olika sidor. Beräkningar måste vara versionshanterade och förklarbara.

## Decision

Inför MetricDefinition / MetricCalculation / MetricSnapshot registry.

Varje betydelsefull derived metric bär:

calculationVersion, asOf, calculatedAt, inputHash (där relevant), coverage, freshness, assumptions/assumptionSetId.

Beräkningslogik lever i `packages/financial-engine`. Persistens och serving i API. AI konsumerar metrics via tools — skapar inte siffror.

Dashboard använder precomputed/aggregated endpoints.

## Consequences

- Formeländringar bump:ar `calculationVersion`.
- Backtesting och reviews kan referera historiska snapshots.
- UI info-icons länkar till definition + assumptions.

## Alternatives considered

- Ad-hoc SQL per page — rejected.
- AI-generated metrics — forbidden by product principle.
