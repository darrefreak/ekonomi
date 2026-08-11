-- Needs Review at cluster level, and learned household classification rules.
--
-- Review stays derived, matching the existing architecture: an unresolved cluster
-- IS the review item. A dismissal is state on the cluster, not a row in a queue.

ALTER TABLE "merchant_clusters" ADD COLUMN IF NOT EXISTS "dismissed_at" timestamptz;
ALTER TABLE "merchant_clusters" ADD COLUMN IF NOT EXISTS "resolved_at" timestamptz;

-- What the household taught the system.
DO $$ BEGIN
  CREATE TYPE "classification_rule_type" AS ENUM (
    'EXACT_SIGNATURE',
    'MERCHANT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "classification_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "rule_type" "classification_rule_type" NOT NULL,
  -- For EXACT_SIGNATURE: the signature key. For MERCHANT: the merchant id as text.
  "match_value" varchar(200) NOT NULL,
  "merchant_id" uuid REFERENCES "merchants"("id") ON DELETE CASCADE,
  "category_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  -- Created from an explicit correction, which ranks above a system rule.
  "user_verified" boolean NOT NULL DEFAULT true,
  "enabled" boolean NOT NULL DEFAULT true,
  "match_count" integer NOT NULL DEFAULT 0,
  "last_matched_at" timestamptz,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- One rule per (household, type, match value): saving the same correction twice
-- updates the rule rather than duplicating it.
CREATE UNIQUE INDEX IF NOT EXISTS "classification_rules_identity"
  ON "classification_rules" ("household_id", "rule_type", "match_value");
CREATE INDEX IF NOT EXISTS "classification_rules_household_enabled_idx"
  ON "classification_rules" ("household_id", "enabled");
