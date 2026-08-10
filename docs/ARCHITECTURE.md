# Architecture — Family Financial OS

## 1. Pipeline (absolut modell)

```
EXTERNAL SOURCES
      ↓
RAW SOURCE DATA
      ↓
SOURCE TRANSACTIONS / SOURCE DOCUMENTS
      ↓
NORMALIZATION
      ↓
FINANCIAL EVENTS
      ↓
HOUSEHOLD LEDGER
      ↓
FINANCIAL DOMAIN MODEL
      ↓
METRICS
      ↓
FORECASTING
      ↓
RULE ENGINE
      ↓
ANOMALY ENGINE
      ↓
RISK ENGINE
      ↓
OPPORTUNITY ENGINE
      ↓
AI ANALYSIS
      ↓
RECOMMENDATIONS
      ↓
USER INTERFACE
```

**Förbjudet anti-mönster:** `BANKTRANSAKTIONER → UI`.

Externa datakällor är aldrig den primära ekonomiska domänmodellen. Originaldata bevaras separat. Normaliserad data är spårbar till källan.

## 2. Monorepo-struktur

```
/
├── apps/
│   ├── web/          # Next.js
│   ├── api/          # NestJS
│   └── mobile/       # Reserverad (Expo) — ej implementerad i V1
├── packages/
│   ├── domain/
│   ├── schemas/
│   ├── api-client/
│   ├── financial-engine/
│   ├── design-tokens/
│   ├── config/
│   ├── utils/
│   └── eslint-config/
├── infrastructure/
│   └── docker/
├── docs/
│   ├── adr/
│   ├── phases/
│   └── phase-reports/
├── docker-compose.yml
├── pnpm-workspace.yaml
└── turbo.json
```

**Verktyg:** pnpm workspaces + Turborepo. TypeScript genom hela stacken. Aktuella stabila/LTS-versioner vid implementationstillfället — undvik hårdkodade gamla versionsnummer i docs.

## 3. Package boundaries

| Package | Innehåll | Får bero på |
|---|---|---|
| `domain` | enums, interfaces, branded IDs, money types, value objects | endast TS std / minimal utils |
| `schemas` | Zod definitions (delade) | `domain`, zod |
| `financial-engine` | rena beräkningar | `domain`, `schemas` (typer), `utils` |
| `api-client` | typed REST client | `schemas`, `domain` |
| `design-tokens` | semantic tokens | ingen UI-framework |
| `utils` | locale, hashing helpers (icke-domän) | ingen Nest/React |
| `config` | shared eslint/tsconfig | — |

### financial-engine får INTE bero på

React, Next.js, NestJS, Drizzle, PostgreSQL, Redis.

Ingen DOM-specifik kod i shared packages.

## 4. Backend

- NestJS, TypeScript, REST, OpenAPI/Swagger
- PostgreSQL + Drizzle ORM (migrations only — ingen auto-sync i production)
- Redis + BullMQ (queues, cache, locks, rate limits)
- Zod för validering

### Modulär uppdelning (minst)

auth, users, households, household-members, permissions, accounts, balances, transactions, ledger, merchants, categories, budgets, recurring, subscriptions, contracts, sinking-funds, bills, income, assets, liabilities, loans, mortgages, investments, vehicles, net-worth, goals, forecasting, scenarios, risk, insights, anomalies, recommendations, opportunities, documents, imports, integrations, notifications, automations, ai, audit, feature-flags, settings, reports, review, search.

### Layers per modul

- controllers
- application services
- repositories
- domain services (eller anrop till `financial-engine`)
- mappers
- schemas

Undvik gigantiska services (`app.service.ts`, `dashboard.service.ts` som gudsklasser).

## 5. Frontend (web)

- Next.js, React, TypeScript
- Tailwind CSS, shadcn/ui, Radix där lämpligt
- TanStack Query, TanStack Table
- React Hook Form, Zod, Recharts, date-fns, Lucide

Frontend konsumerar backend **endast** via `packages/api-client`.

Mockdata får inte hårdkodas i React-komponenter — kommer från API (inkl. demo seed).

## 6. Mobile (framtida)

`apps/mobile` reserveras för Expo + React Native + Expo Router (iOS först).

Återanvänd: domain, schemas, api-client, financial-engine, design-tokens, utils.

Backend är helt klientoberoende. Web-IA ska redan fungera på iPhone-bredd (~375px).

## 7. Docker-utvecklingsmiljö

```bash
docker compose up -d
```

Services: `web`, `api`, `worker`, `postgres`, `redis`, `minio`, `mailpit`.

Persistent state endast i PostgreSQL och object storage (MinIO lokalt / S3-kompatibelt i prod). Services får inte förlita sig på lokala filer för persistence.

## 8. Jobs

BullMQ + Redis. Jobb ska vara idempotenta, spårbara, household-scoped. Se [ADR-0005](./adr/0005-jobs.md).

Förberedda job types (V1 ofta mot mockdata):

IMPORT_SOURCE, NORMALIZE_TRANSACTION, RECONCILE_TRANSFER, CLASSIFY_TRANSACTION, MATCH_MERCHANT, DETECT_RECURRING, CALCULATE_METRICS, CALCULATE_NET_WORTH, GENERATE_FORECAST, BACKTEST_FORECAST, RUN_ANOMALY_ANALYSIS, RUN_RISK_ANALYSIS, GENERATE_INSIGHTS, GENERATE_AI_REPORT, SYNC_INTEGRATION, PROCESS_DOCUMENT, MATCH_DOCUMENT, UPDATE_FINANCIAL_COVERAGE, MATCH_VEHICLE_COSTS, CALCULATE_VEHICLE_TCO, CALCULATE_VEHICLE_VALUATION, ANALYZE_VEHICLE_REPLACEMENT_WINDOW, BUILD_VEHICLE_MARKET_SNAPSHOT, MONITOR_LEASE_MILEAGE.

## 9. Data source abstraction

Separera provider, transport, autentisering och datadomän. Se [ADR-0004](./adr/0004-data-source-architecture.md).

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

V1: mock providers + fake sync + connection health UI. Inga riktiga connectors.

Authenticated browser connectors (framtida): användaren autentiserar själv (inkl. BankID). Systemet ber aldrig om BankID-kod och lagrar aldrig BankID-credentials.

## 10. API

Prefix: `/api/v1`

Konsistent response-format. Aggregated dashboard endpoint:

`GET /api/v1/dashboard` — undvik ~30 individuella anrop för dashboard.

Health:

- `/health`
- `/health/ready`
- `/health/live`

## 10b. Kommandoidentitet (idempotens)

Tre identiteter finns i systemet och de är **inte** utbytbara. Att blanda ihop de två första
gav RT2-003; att ignorera den första gav RT2-002.

| Identitet | Svarar på | Källa | Vid träff |
|---|---|---|---|
| `Idempotency-Key` | "är detta HTTP-kommandot ett omförsök av **samma användaravsikt**?" | klienten, ogenomskinlig, per kommandotyp | returnera samma resultat; `409 IDEMPOTENCY_CONFLICT` om innehållet skiljer |
| `externalId` | "är detta **samma post hos källan**?" | leverantören/importen | dedupliceras som samma post |
| Naturlig affärsnyckel | "förbjuder domänen två entiteter med dessa egenskaper?" | domänen | domänfel — **aldrig** en idempotenskonflikt |

Kanonisk kommandoidentitet är `householdId + commandType + Idempotency-Key`, med
databasunikhet på just den tripeln (`command_idempotency` för aggregatkommandon,
motsvarande nyckel för finansiella händelser). Samma nyckel för `CREATE_ACCOUNT` och
`CREATE_VEHICLE` kolliderar därför inte.

Ett aggregatkommando (t.ex. onboarding av ett finansierat fordon: fordon + tillgångskonto +
lånekonto + öppningspositioner + audit) reserverar sin idempotensrad **i samma transaktion**
som kommandots kropp, så antingen committas allt eller ingenting. Samtidiga anrop med samma
nyckel serialiseras av unika indexet: förloraren väntar på vinnarens radlås och läser sedan
tillbaka vinnarens resultat i stället för att göra arbetet igen.

Utan nyckel körs kommandot bara: en klient som inte begär omförsöksskydd får det inte, och
två identiska anrop är två genuina handlingar. Två kommandon med **olika** nycklar men samma
ekonomiska form (t.ex. 10 000 kr till sparkontot två gånger samma dag) är två legitima
händelser och båda registreras.

Semantiken i sin helhet: [`docs/remediation/RT2_CRITICAL_REPORT.md`](./remediation/RT2_CRITICAL_REPORT.md).

## 11. Auth

Access token + refresh token-modell (eller ekvivalent) som fungerar för web, framtida native iOS, passkeys/MFA. Inte beroende av browser-only session state. Se [ADR-0003](./adr/0003-authentication.md).

## 12. Feature flags

Enkel arkitektur. Exempel-flaggor: AI, browserConnectors, payments, nativeApp, experimentalForecast, vehicleMarketIntelligence, vehicleRecommendations, housingIntelligence.

## 13. Observability

- Structured logs
- Request IDs, job IDs
- Error tracking abstraction
- Aldrig logga känslig ekonomisk rådata i onödan

## 14. Production readiness

Arkitekturen ska enkelt kunna flyttas från lokal Docker till AWS/Azure/annan containerplattform. Persistence: Postgres + S3-kompatibel object storage. Undvik onödig vendor lock-in.

## 15. Decision rules

Vid tekniska beslut, prioritera i ordning:

1. Korrekt för ekonomisk domän
2. Enkel att underhålla
3. Stark typning
4. Fungerar bra i Docker
5. Säker
6. Fungerar för framtida iOS
7. Minimerar vendor lock-in
8. Håller financial logic separerad från UI
9. Håller integrationer separerade från financial domain
10. Enkel att testa
