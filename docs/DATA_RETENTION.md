# Data Retention — Family Financial OS

## 1. Principles

1. **Raw source retention:** Normaliserad data får aldrig vara den enda kopian av importerad källa.
2. **Provenance:** Transformationer ska vara spårbara.
3. **Least retention for secrets:** Tokens/sessions minimeras; BankID credentials lagras aldrig.
4. **User control:** Export/delete-flöden designas in (implementation i senare faser).
5. **Legal/license limits:** Särskilt fordonsmarknadsdata — retention enligt license metadata.

## 2. Data classes

| Klass | Exempel | Retention-riktning |
|---|---|---|
| Raw import records | Provider payloads | Behåll för audit/reprocess tills user delete eller policy |
| Normalized financial | Events, ledger, accounts | Aktiv household lifetime + delete flows |
| Derived metrics | MetricSnapshot | Versionsbart; kan rebuildas; behåll för historik |
| Documents / object storage | PDF, images | Tills archive/delete; signed URL access |
| Auth tokens | Refresh tokens | Kort; rotation; revoke on logout/leave |
| Connector secrets | OAuth tokens (future) | Encrypted; minimal TTL; never in logs |
| Audit logs | who/what/when | Längre retention; append-ish |
| Market listings (future) | Vehicle ads | Strict license/retentionPolicy fields |
| Demo data | Seed household | Resettable; isolated |

## 3. Raw import records

Tabellriktning: `raw_import_records` med payload, hash, schemaVersion, processingStatus.

Syften:

- ombearbetning efter bugfix i normalisering
- duplicate detection
- dispute/audit
- connector schema evolution

Se [ADR-0008](./adr/0008-raw-source-retention.md).

## 4. Import batches

UI visar importhistorik. Batch metadata (counts, status, timestamps) behålls även om raw payload senare raderas (tombstone/summary).

## 5. Derived data rebuild

Metrics/forecasts ska kunna beräknas om från ledger + assumptions. Snapshots sparas för:

- performance
- explainability (“as of”)
- backtesting

Vid `calculationVersion`-bump: ny beräkning, gamla snapshots behålls med version.

## 6. Backup

Implementerad i OR1. Se [`pilot/PILOT_DATA_POLICY.md`](./pilot/PILOT_DATA_POLICY.md)
för policyn och [`pilot/PILOT_RUNBOOK.md`](./pilot/PILOT_RUNBOOK.md) för
handhavandet.

| Del | Verktyg |
|---|---|
| PostgreSQL | `pnpm backup:postgres` — `pg_dump -Fc`, checksummad, verifierad med `pg_restore --list` |
| Objektlagring | `pnpm backup:objects` — kopia till separat destination utanför bucketen |
| Båda + manifest | `pnpm backup:pilot` |
| Återställning | `pnpm recovery:prepare` — till isolerad recovery-databas och recovery-bucket |

Backupdestinationen är en host-katalog utanför alla containervolymer. Retention
för pilot: 14 dagar, minst tre kompletta backuper.

> **Bucket versioning får inte användas som backup.**
>
> Tidigare rekommenderade det här dokumentet "MinIO (bucket versioning/export
> senare)". Den rekommendationen är återkallad, och `pnpm pilot:preflight`
> vägrar numera starta en pilot mot en versionerad bucket.
>
> Skälet är uppmätt, inte teoretiskt: med versioning påslaget raderar
> applikationen ett objekt, lagringen bekräftar att den aktuella versionen är
> borta, raderingen rapporterar korrekt `completed` — och den föregående
> versionen går fortfarande att läsa i sin helhet, personnummer och allt.
> Versioning skulle göra varje slutförd radering till ett osant påstående.
>
> Backup är därför en separat kopia på separat medium, med egen bounded
> retention, och raderingsliggaren är det som hindrar backuperna från att
> motsäga en radering.

## 7. Deletion design

| Action | Scope |
|---|---|
| Delete document | Object + DB row + links |
| Delete source | Connection, future sync stopped; decide keep/purge historical |
| Delete personal data | Member-owned entities; recompute household aggregates |
| Delete household | Cascading delete / soft-delete + object purge job |
| Leave household | Revoke access; optional personal data export |

Jobs för purge ska vara idempotenta och audit-loggade.

## 8. Logging retention

Structured logs: korta TTL i V1/dev. Inga fulla transaction payloads i loggar.
