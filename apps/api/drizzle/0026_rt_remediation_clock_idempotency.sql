-- V1 Red Team remediation (RT-001, RT-002, RT-004)

-- RT-001: demo households carry their own frozen product date; every other
-- household uses the real application clock.
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "demo_as_of" date;

-- Existing demo data was seeded before the column existed; keep its frozen date.
UPDATE "households"
SET "demo_as_of" = DATE '2026-08-01'
WHERE "name" = 'Familjen Demo' AND "demo_as_of" IS NULL;

-- RT-002: command idempotency must also work for manual commands that carry no
-- source externalId. `external_id` now stores the resolved command key and
-- `key_source` separates client Idempotency-Key identity from source identity.
ALTER TABLE "financial_command_idempotency"
  ADD COLUMN IF NOT EXISTS "key_source" varchar(20) NOT NULL DEFAULT 'external_id';

DROP INDEX IF EXISTS "financial_command_idempotency_key";

CREATE UNIQUE INDEX IF NOT EXISTS "financial_command_idempotency_key"
  ON "financial_command_idempotency" (
    "household_id",
    "command_type",
    "key_source",
    "external_id"
  );

-- RT-004: remove historical duplicate balance snapshots for the same account,
-- calendar day and source. Net worth history reads additionally deduplicate per
-- (account, day) so a second writer can never double-count the asOf bucket.
DELETE FROM "account_balance_snapshots" a
USING "account_balance_snapshots" b
WHERE a.account_id = b.account_id
  AND a.source = b.source
  AND (a.as_of AT TIME ZONE 'UTC')::date = (b.as_of AT TIME ZONE 'UTC')::date
  AND a.id < b.id;
