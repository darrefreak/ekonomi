-- P1-U4: opportunity persistence fields + analysis runs + job runs

ALTER TYPE "opportunity_status" ADD VALUE IF NOT EXISTS 'VIEWED';
ALTER TYPE "opportunity_status" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "type" varchar(64) NOT NULL DEFAULT 'OTHER';
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "detector_key" varchar(80) NOT NULL DEFAULT 'other';
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "identity_key" varchar(200) NOT NULL DEFAULT '';
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "estimated_monthly_impact_minor" bigint;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "estimate_basis" text;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "assumptions" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "facts" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "data_sources" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "evidence" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "confidence_score" numeric(5, 4) DEFAULT '0.5';
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "confidence_label" varchar(16) DEFAULT 'medium';
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "priority_score" numeric(8, 6) DEFAULT '0';
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "calculation_version" varchar(40) NOT NULL DEFAULT 'opp-v1.0.0';
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "input_hash" varchar(80) NOT NULL DEFAULT '';
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "as_of" date;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "valid_until" date;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "last_calculated_at" timestamptz;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "next_review_at" timestamptz;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "dismissed_at" timestamptz;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "subject_entity_id" uuid;

-- Backfill pre-existing (seeded / unread) rows so the new unique index can be created.
-- These rows are dead/unread by live product APIs (see docs/completion/p1/P1_U4_AUDIT.md).
UPDATE "opportunities" SET "identity_key" = 'legacy:' || "id"::text WHERE "identity_key" = '';

CREATE UNIQUE INDEX IF NOT EXISTS "opportunities_household_identity_uidx"
  ON "opportunities" ("household_id", "identity_key");

CREATE TABLE IF NOT EXISTS "analysis_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "kind" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'READY',
  "as_of" date NOT NULL,
  "calculation_version" varchar(40),
  "job_id" varchar(120),
  "error_code" varchar(80),
  "summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "analysis_runs_household_kind_idx"
  ON "analysis_runs" ("household_id", "kind", "created_at");

CREATE TABLE IF NOT EXISTS "anomaly_findings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "rule_key" varchar(80) NOT NULL,
  "title" varchar(200) NOT NULL,
  "detail" text NOT NULL,
  "severity" varchar(16) NOT NULL DEFAULT 'medium',
  "entity_id" uuid,
  "entity_kind" varchar(40),
  "amount_minor" bigint,
  "as_of" date NOT NULL,
  "facts" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "identity_key" varchar(200) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "anomaly_findings_household_identity_uidx"
  ON "anomaly_findings" ("household_id", "identity_key");
