-- Slice 3: OpenAI classification fallback + Financial Brief V2.
--
-- ai_classification_results is cache and audit trail in one: the unique index
-- is the cache identity (§15), the hashes/usage/status are the audit metadata
-- (§17). Cascade from households covers erasure (§51).

CREATE TABLE "ai_classification_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"signature" varchar(160) NOT NULL,
	"signature_version" varchar(40) NOT NULL,
	"direction" varchar(8) NOT NULL,
	"taxonomy_version" varchar(80) NOT NULL,
	"prompt_version" varchar(80) NOT NULL,
	"schema_version" varchar(40) NOT NULL,
	"provider" varchar(40) NOT NULL,
	"model" varchar(80) NOT NULL,
	"input_hash" varchar(64) NOT NULL,
	"result_hash" varchar(64) NOT NULL,
	"status" varchar(20) NOT NULL,
	"result" jsonb,
	"combined_confidence" numeric(6, 4),
	"failure_reason" varchar(200),
	"usage" jsonb,
	"latency_ms" integer,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_classification_results" ADD CONSTRAINT "ai_classification_results_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_classification_results_identity" ON "ai_classification_results" USING btree ("household_id","signature","direction","signature_version","taxonomy_version","prompt_version","model");
--> statement-breakpoint
CREATE TABLE "financial_brief_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"input_hash" varchar(64) NOT NULL,
	"findings_version" varchar(40) NOT NULL,
	"template_version" varchar(40) NOT NULL,
	"generator" varchar(20) NOT NULL,
	"prompt_version" varchar(80),
	"model" varchar(80),
	"headline" varchar(240) NOT NULL,
	"brief" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_brief_snapshots" ADD CONSTRAINT "financial_brief_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "financial_brief_snapshots_identity" ON "financial_brief_snapshots" USING btree ("household_id","input_hash","findings_version","template_version","generator");
--> statement-breakpoint
ALTER TABLE "household_settings" ADD COLUMN "ai_transaction_analysis_enabled" boolean DEFAULT false NOT NULL;
