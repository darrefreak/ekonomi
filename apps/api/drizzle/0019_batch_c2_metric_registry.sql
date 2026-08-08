-- Batch C2: Metric Registry persistence (definitions + rebuildable snapshots).

CREATE TABLE IF NOT EXISTS "metric_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "metric_key" varchar(80) NOT NULL,
  "display_name" varchar(160) NOT NULL,
  "formula_description" text NOT NULL,
  "calculation_version" varchar(40) NOT NULL,
  "value_kind" varchar(40) NOT NULL,
  "unit" varchar(40),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "metric_definitions_key_version"
  ON "metric_definitions" ("metric_key", "calculation_version");

CREATE TABLE IF NOT EXISTS "metric_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "metric_key" varchar(80) NOT NULL,
  "calculation_version" varchar(40) NOT NULL,
  "as_of" varchar(10) NOT NULL,
  "period" varchar(40),
  "currency" varchar(3),
  "value_minor" varchar(40),
  "value_number" numeric(18, 6),
  "input_hash" varchar(80),
  "coverage_percent" integer,
  "freshness_label" varchar(80),
  "calculated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "metric_snapshots_household_key_asof_version"
  ON "metric_snapshots" ("household_id", "metric_key", "as_of", "calculation_version");
