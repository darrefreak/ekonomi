# ADR-0008: Raw Source Retention

## Status

Accepted (Phase 0)

## Context

Om endast normaliserad data sparas förloras möjligheten att ominterpretera, dedupe:a och audita integrationer. Importerad källa måste bevaras separat.

## Decision

- Lagra `raw_import_records` (payload, hash, schemaVersion, processingStatus, provider, sourceId, receivedAt).
- Koppla normaliserade entities via provenance fields (`sourceRecordId`, `importBatchId`, …).
- ImportBatch spårar counts/status för UI.
- Duplicate prevention via external IDs, fingerprints, hashes.
- Object storage (MinIO/S3) för filer; Postgres för metadata + JSON payloads (storlekspolicies senare).

Normaliserad data är **aldrig** enda kopian av importerad källa (tills explicit user purge enligt retention policy).

## Consequences

- Storage cost increases — acceptable for correctness.
- Reprocessing jobs become possible after classifier/ledger fixes.
- Delete flows must consider raw + normalized + objects.

## Alternatives considered

- Keep only normalized transactions — rejected.
- External-only (re-fetch forever) — rejected (providers delete history; legal holds).
