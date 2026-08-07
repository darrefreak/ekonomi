CREATE TABLE "vehicle_market_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"ask_low_minor" bigint NOT NULL,
	"ask_mid_minor" bigint NOT NULL,
	"ask_high_minor" bigint NOT NULL,
	"sample_size" integer DEFAULT 12 NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "vehicle_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"make" varchar(80) NOT NULL,
	"model" varchar(80) NOT NULL,
	"model_year" integer NOT NULL,
	"ask_price_minor" bigint NOT NULL,
	"estimated_monthly_economic_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"source" varchar(80) DEFAULT 'mock_market' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "vehicle_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"current_vehicle_id" uuid,
	"candidate_id" uuid,
	"monthly_delta_minor" bigint NOT NULL,
	"confidence" numeric(5, 4) DEFAULT '0.65',
	"recommendation" varchar(40) DEFAULT 'hold' NOT NULL,
	"summary" text NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_replacement_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"sell_window_start" date,
	"sell_window_end" date,
	"target_equity_minor" bigint,
	"status" varchar(40) DEFAULT 'WATCH' NOT NULL,
	"summary" text NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicle_market_snapshots" ADD CONSTRAINT "vehicle_market_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_market_snapshots" ADD CONSTRAINT "vehicle_market_snapshots_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_candidates" ADD CONSTRAINT "vehicle_candidates_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_comparisons" ADD CONSTRAINT "vehicle_comparisons_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_comparisons" ADD CONSTRAINT "vehicle_comparisons_current_vehicle_id_vehicles_id_fk" FOREIGN KEY ("current_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_comparisons" ADD CONSTRAINT "vehicle_comparisons_candidate_id_vehicle_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."vehicle_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_replacement_plans" ADD CONSTRAINT "vehicle_replacement_plans_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_replacement_plans" ADD CONSTRAINT "vehicle_replacement_plans_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;
