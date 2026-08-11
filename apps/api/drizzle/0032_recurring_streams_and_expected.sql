-- Recurring streams persisted from clusters, and expected future transactions.
--
-- recurring_items is extended rather than duplicated: a detected stream gets a
-- stable identity (household, signature, direction) so re-running analysis
-- updates the same row. Legacy manually-seeded rows keep a NULL signature and
-- are untouched by the detector.

ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "signature" varchar(200);
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "signature_version" varchar(20);
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "cluster_id" uuid REFERENCES "merchant_clusters"("id") ON DELETE SET NULL;
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "direction" varchar(16) NOT NULL DEFAULT 'OUTFLOW';
-- Cadence answers WHEN; recurring_type answers WHAT KIND (SUBSCRIPTION,
-- UTILITY_BILL, SALARY, …, UNKNOWN_RECURRING). Kept as varchar because the
-- semantic vocabulary belongs to the engine, not the database.
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "recurring_type" varchar(30);
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "is_subscription" boolean NOT NULL DEFAULT false;
-- Tri-state user override: NULL = detector decides, true/false = the household said so.
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "user_marked_subscription" boolean;
-- The household explicitly confirmed or dismissed this stream; reruns must respect it.
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "user_verified" boolean NOT NULL DEFAULT false;
-- Recurrence evidence (§4–5): counts, intervals, amount statistics.
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "occurrence_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "first_seen_on" date;
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "median_amount_minor" bigint;
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "min_amount_minor" bigint;
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "max_amount_minor" bigint;
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "amount_volatility_bps" integer;
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "median_interval_days" integer;
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "interval_spread_days" integer;
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "amount_stable" boolean NOT NULL DEFAULT false;
-- Price intelligence: material amount regimes, exact minor units as strings in jsonb.
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "price_changes" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "original_amount_minor" bigint;
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "annual_price_impact_minor" bigint;
-- Why the detector concluded what it did, for the "why am I seeing this" surface.
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "evidence" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "detection_version" varchar(20);
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "first_detected_at" timestamptz;

-- One stream per (household, signature, direction). Partial: manual rows have no signature.
CREATE UNIQUE INDEX IF NOT EXISTS "recurring_items_stream_identity"
  ON "recurring_items" ("household_id", "signature", "direction")
  WHERE "signature" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "recurring_items_household_status_idx"
  ON "recurring_items" ("household_id", "status");

-- Expected future transactions. Forecasts only: never ledger events, never
-- postings, never balance changes (§21).
DO $$ BEGIN
  CREATE TYPE "expected_transaction_status" AS ENUM (
    'PENDING',
    'FULFILLED',
    'MISSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "expected_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "recurring_item_id" uuid NOT NULL REFERENCES "recurring_items"("id") ON DELETE CASCADE,
  "expected_from" date NOT NULL,
  "expected_to" date NOT NULL,
  "expected_amount_minor" bigint NOT NULL,
  "expected_low_minor" bigint NOT NULL,
  "expected_high_minor" bigint NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'SEK',
  "direction" varchar(16) NOT NULL DEFAULT 'OUTFLOW',
  "confidence" numeric(5,4),
  "status" "expected_transaction_status" NOT NULL DEFAULT 'PENDING',
  "matched_transaction_id" uuid REFERENCES "source_transactions"("id") ON DELETE SET NULL,
  "matched_on" date,
  "missed_noted_at" timestamptz,
  "generated_at" timestamptz NOT NULL DEFAULT now(),
  "model_version" varchar(20),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- One expectation per stream and window start: reruns upsert, never duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS "expected_transactions_identity"
  ON "expected_transactions" ("recurring_item_id", "expected_from");
CREATE INDEX IF NOT EXISTS "expected_transactions_household_status_idx"
  ON "expected_transactions" ("household_id", "status", "expected_to");
