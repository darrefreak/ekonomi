CREATE TYPE "public"."document_status" AS ENUM('NEW', 'PROCESSING', 'REVIEW', 'ACTION_REQUIRED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('INVOICE', 'INSURANCE', 'TAX', 'LOAN_STATEMENT', 'ANNUAL_STATEMENT', 'SALARY', 'CONTRACT', 'RECEIPT', 'VEHICLE', 'OTHER');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"document_type" "document_type" DEFAULT 'OTHER' NOT NULL,
	"status" "document_status" DEFAULT 'NEW' NOT NULL,
	"issuer" varchar(160),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"amount_minor" bigint,
	"currency" varchar(3) DEFAULT 'SEK',
	"extracted" jsonb DEFAULT '{}'::jsonb,
	"source_name" varchar(120),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"source_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" varchar(40) DEFAULT 'COMPLETED' NOT NULL,
	"records_fetched" integer DEFAULT 0 NOT NULL,
	"message" text
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_household_idx" ON "documents" USING btree ("household_id","status");
