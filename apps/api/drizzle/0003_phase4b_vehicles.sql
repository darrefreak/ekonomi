CREATE TYPE "public"."vehicle_ownership_type" AS ENUM('PRIVATE_OWNED', 'FINANCED', 'PRIVATE_LEASE', 'COMPANY_OWNED', 'BENEFIT_CAR', 'SHARED', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."vehicle_cost_kind" AS ENUM('PURCHASE_PRICE', 'DEPRECIATION', 'LOAN_PRINCIPAL', 'LOAN_INTEREST', 'FEE', 'INSURANCE', 'TAX', 'INSPECTION', 'SERVICE', 'REPAIR', 'TIRES', 'ENERGY', 'PARKING', 'TOLL', 'OTHER');--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"make" varchar(80) NOT NULL,
	"model" varchar(80) NOT NULL,
	"model_year" integer NOT NULL,
	"registration_number" varchar(16),
	"fuel_type" varchar(40) DEFAULT 'petrol' NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"purchase_price_minor" bigint,
	"purchase_date" date,
	"estimated_value_low_minor" bigint,
	"estimated_value_mid_minor" bigint,
	"estimated_value_high_minor" bigint,
	"valuation_as_of" date,
	"linked_asset_account_id" uuid,
	"linked_loan_account_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_ownerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"ownership_type" "vehicle_ownership_type" DEFAULT 'FINANCED' NOT NULL,
	"owner_share_percent" numeric(5, 2) DEFAULT '100' NOT NULL,
	"started_on" date,
	"ended_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_usage_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"annual_km" integer DEFAULT 15000 NOT NULL,
	"commute_share_percent" numeric(5, 2) DEFAULT '60' NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_finance_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"lender" varchar(120) NOT NULL,
	"principal_minor" bigint NOT NULL,
	"remaining_minor" bigint NOT NULL,
	"interest_rate_bps" integer NOT NULL,
	"monthly_payment_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_odometer_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"reading_km" integer NOT NULL,
	"recorded_on" date NOT NULL,
	"source" varchar(40) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_cost_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"kind" "vehicle_cost_kind" NOT NULL,
	"occurred_on" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"is_economic_cost" boolean DEFAULT true NOT NULL,
	"odometer_km" integer,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_linked_asset_account_id_accounts_id_fk" FOREIGN KEY ("linked_asset_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_linked_loan_account_id_accounts_id_fk" FOREIGN KEY ("linked_loan_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_usage_profiles" ADD CONSTRAINT "vehicle_usage_profiles_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_usage_profiles" ADD CONSTRAINT "vehicle_usage_profiles_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_finance_agreements" ADD CONSTRAINT "vehicle_finance_agreements_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_finance_agreements" ADD CONSTRAINT "vehicle_finance_agreements_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_odometer_readings" ADD CONSTRAINT "vehicle_odometer_readings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_odometer_readings" ADD CONSTRAINT "vehicle_odometer_readings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_cost_events" ADD CONSTRAINT "vehicle_cost_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_cost_events" ADD CONSTRAINT "vehicle_cost_events_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicles_household_idx" ON "vehicles" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "vehicle_cost_events_vehicle_idx" ON "vehicle_cost_events" USING btree ("vehicle_id","occurred_on");
