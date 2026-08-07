CREATE TYPE "public"."opportunity_status" AS ENUM('NEW', 'ACTIVE', 'ACCEPTED', 'DISMISSED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('LOW', 'MODERATE', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."scenario_status" AS ENUM('DRAFT', 'READY', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "forecast_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"horizon_days" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"forecast_run_id" uuid NOT NULL,
	"on_date" date NOT NULL,
	"projected_cash_minor" bigint NOT NULL,
	"projected_net_worth_minor" bigint NOT NULL,
	"label" varchar(80)
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"estimated_annual_saving_minor" bigint,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"confidence" numeric(5, 4) DEFAULT '0.7',
	"effort" varchar(40) DEFAULT 'medium' NOT NULL,
	"risk" varchar(40) DEFAULT 'low' NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"status" "opportunity_status" DEFAULT 'NEW' NOT NULL,
	"category" varchar(80) DEFAULT 'general' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"dimension" varchar(80) NOT NULL,
	"level" "risk_level" DEFAULT 'MODERATE' NOT NULL,
	"title" varchar(200) NOT NULL,
	"detail" text NOT NULL,
	"score" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_dimensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"dimension" varchar(80) NOT NULL,
	"score" integer NOT NULL,
	"level" "risk_level" DEFAULT 'MODERATE' NOT NULL,
	"summary" text NOT NULL,
	"as_of" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"status" "scenario_status" DEFAULT 'READY' NOT NULL,
	"assumptions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"projected_monthly_delta_minor" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "forecast_runs" ADD CONSTRAINT "forecast_runs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_points" ADD CONSTRAINT "forecast_points_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_points" ADD CONSTRAINT "forecast_points_forecast_run_id_forecast_runs_id_fk" FOREIGN KEY ("forecast_run_id") REFERENCES "public"."forecast_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_dimensions" ADD CONSTRAINT "health_dimensions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
