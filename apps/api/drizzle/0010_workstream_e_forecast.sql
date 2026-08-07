CREATE TABLE IF NOT EXISTS "forecast_actual_comparisons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE cascade,
  "forecast_run_id" uuid REFERENCES "forecast_runs"("id") ON DELETE set null,
  "label" varchar(80) NOT NULL,
  "on_date" date NOT NULL,
  "projected_cash_minor" bigint NOT NULL,
  "actual_cash_minor" bigint NOT NULL,
  "projected_net_worth_minor" bigint NOT NULL,
  "actual_net_worth_minor" bigint NOT NULL,
  "cash_error_minor" bigint NOT NULL,
  "net_worth_error_minor" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "forecast_actual_comparisons_household_idx"
  ON "forecast_actual_comparisons" ("household_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "forecast_accuracy_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE cascade,
  "forecast_run_id" uuid REFERENCES "forecast_runs"("id") ON DELETE set null,
  "horizon_label" varchar(80) NOT NULL,
  "sample_count" integer NOT NULL DEFAULT 1,
  "mape_cash_percent" numeric(10, 4),
  "mape_net_worth_percent" numeric(10, 4),
  "abs_cash_error_minor" bigint NOT NULL DEFAULT 0,
  "abs_net_worth_error_minor" bigint NOT NULL DEFAULT 0,
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "forecast_accuracy_metrics_household_idx"
  ON "forecast_accuracy_metrics" ("household_id");
