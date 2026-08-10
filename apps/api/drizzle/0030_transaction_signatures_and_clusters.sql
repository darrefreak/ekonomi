-- Transaction signatures and merchant clusters on persisted data.
--
-- Until now the signature engine was a pure function nothing called, so imported
-- transactions carried no merchant, no category and no grouping. See
-- docs/intelligence/FINANCIAL_INTELLIGENCE_COMPLETION_PLAN.md.

-- 1. The signature a transaction was grouped by, and the algorithm that produced it.
--
-- Versioned because the algorithm will change: without the version there is no way
-- to tell a stale signature from a current one, and no controlled way to recompute.
ALTER TABLE "source_transactions" ADD COLUMN IF NOT EXISTS "signature" varchar(200);
ALTER TABLE "source_transactions" ADD COLUMN IF NOT EXISTS "signature_version" varchar(20);

CREATE INDEX IF NOT EXISTS "source_tx_signature_idx"
  ON "source_transactions" ("household_id", "signature");

-- 2. How a transaction came to have its classification.
--
-- The distinction the previous acceptance lacked: a transaction that fell back to a
-- default category is not "automatically classified", and reporting it as such
-- produced a 100 % figure that meant nothing.
DO $$ BEGIN
  CREATE TYPE "classification_source" AS ENUM (
    'USER_VERIFIED',
    'DETERMINISTIC_MATCH',
    'LEARNED_RULE',
    'AI_MATCH',
    'DEFAULTED',
    'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "source_transactions"
  ADD COLUMN IF NOT EXISTS "classification_source" "classification_source"
  NOT NULL DEFAULT 'UNKNOWN';

CREATE INDEX IF NOT EXISTS "source_tx_classification_source_idx"
  ON "source_transactions" ("household_id", "classification_source");

-- 3. Merchant clusters: transactions that probably share an economic meaning.
CREATE TABLE IF NOT EXISTS "merchant_clusters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "signature" varchar(200) NOT NULL,
  "signature_version" varchar(20) NOT NULL,
  -- A few real descriptions, so a person reviewing the cluster can see what it is.
  "representative_descriptions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "transaction_count" integer NOT NULL DEFAULT 0,
  "first_seen" date,
  "last_seen" date,
  "median_amount_minor" bigint,
  "min_amount_minor" bigint,
  "max_amount_minor" bigint,
  -- INFLOW or OUTFLOW; a cluster containing both is split rather than averaged.
  "direction" varchar(16) NOT NULL DEFAULT 'OUTFLOW',
  "median_interval_days" integer,
  "interval_spread_days" integer,
  "merchant_id" uuid REFERENCES "merchants"("id") ON DELETE SET NULL,
  "merchant_candidate" varchar(200),
  "merchant_confidence" numeric(5, 4),
  "category_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  "classification_source" "classification_source" NOT NULL DEFAULT 'UNKNOWN',
  -- True when the cluster is a bare reference number with nothing identifying.
  "opaque" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- One cluster per signature per household per algorithm version, so a re-run
-- updates rather than duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS "merchant_clusters_identity"
  ON "merchant_clusters" ("household_id", "signature", "signature_version");
CREATE INDEX IF NOT EXISTS "merchant_clusters_household_count_idx"
  ON "merchant_clusters" ("household_id", "transaction_count" DESC);
