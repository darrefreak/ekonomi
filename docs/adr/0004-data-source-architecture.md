# ADR-0004: Data Source Architecture

## Status

Accepted (Phase 0)

## Context

Provider, transport, autentisering och datadomän får inte blandas. V1 har inga riktiga bankintegrationer men måste kunna ansluta dem utan ombyggnad.

## Decision

Inför abstraktionen `FinancialDataSource`:

```ts
interface FinancialDataSource {
  providerId: string;
  domain: DataSourceDomain;
  protocol: ConnectorProtocol;
  authenticationMethod: AuthenticationMethod;
  capabilities: DataSourceCapability[];
  testConnection(): Promise<ConnectionStatus>;
  sync(context: SyncContext): Promise<SyncResult>;
}
```

Enums enligt produktspec (domain/protocol/auth/file formats).

Connection states: CONNECTED, SYNCING, AUTH_REQUIRED, DEGRADED, ERROR, DISCONNECTED.

Freshness exponeras per källa.

V1 implementerar **mock providers** + fake sync + UI för health/import history.

Future connector **metadata/interfaces** skapas (SEB, SBAB, Revolut, …) men utan riktig sync-logik.

Authenticated browser connectors (future): användaren autentiserar själv; aldrig BankID-kod/credentials i vårt system.

Pipeline: External → Raw → Normalize → Domain (aldrig raw direkt till UI som sanning).

## Consequences

- Integration module äger connectors; financial domain äger events/ledger.
- ImportBatch + raw_import_records krävs från economic foundation (Phase 2).
- Compliance/license metadata obligatorisk för market connectors.

## Alternatives considered

- Hårdkoda “BankAccountProvider” per bank i domain — rejected.
- Importera CSV direkt till transactions utan raw layer — rejected (provenance).
