CREATE TYPE "public"."budget_period_status" AS ENUM('DRAFT', 'ACTIVE', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."recurring_status" AS ENUM('DETECTED', 'CONFIRMED', 'DISMISSED', 'PAUSED');--> statement-breakpoint
CREATE TYPE "public"."recurring_cadence" AS ENUM('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('ACTIVE', 'CANCELLED', 'PAUSED', 'TRIAL');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('ACTIVE', 'ENDING', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."goal_type" AS ENUM('EMERGENCY_FUND', 'INVESTMENT_TARGET', 'DEBT_FREE', 'HOME_PURCHASE', 'CAR', 'TRAVEL', 'EDUCATION', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "budget_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"label" varchar(40) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"status" "budget_period_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"budget_period_id" uuid NOT NULL,
	"category_id" uuid,
	"category_key" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"planned_minor" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"kind" varchar(40) DEFAULT 'expense' NOT NULL,
	"cadence" "recurring_cadence" DEFAULT 'MONTHLY' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"category_id" uuid,
	"merchant_id" uuid,
	"status" "recurring_status" DEFAULT 'DETECTED' NOT NULL,
	"next_expected_on" date,
	"last_seen_on" date,
	"confidence" numeric(5, 4) DEFAULT '0.9',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"merchant_id" uuid,
	"category_id" uuid,
	"cadence" "recurring_cadence" DEFAULT 'MONTHLY' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"status" "subscription_status" DEFAULT 'ACTIVE' NOT NULL,
	"first_detected_on" date,
	"last_charged_on" date,
	"next_charge_on" date,
	"price_trend_percent" numeric(8, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"provider" varchar(160) NOT NULL,
	"contract_type" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"status" "contract_status" DEFAULT 'ACTIVE' NOT NULL,
	"start_date" date,
	"end_date" date,
	"binding_period_end" date,
	"renewal_date" date,
	"cancellation_deadline" date,
	"notice_period_days" integer,
	"monthly_cost_minor" bigint,
	"annual_cost_minor" bigint,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"auto_renewal" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sinking_funds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"category_key" varchar(80),
	"target_minor" bigint NOT NULL,
	"current_reserved_minor" bigint DEFAULT 0 NOT NULL,
	"monthly_contribution_minor" bigint DEFAULT 0 NOT NULL,
	"target_date" date,
	"priority" integer DEFAULT 3 NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"linked_account_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"goal_type" "goal_type" DEFAULT 'CUSTOM' NOT NULL,
	"status" "goal_status" DEFAULT 'ACTIVE' NOT NULL,
	"target_minor" bigint NOT NULL,
	"current_minor" bigint DEFAULT 0 NOT NULL,
	"monthly_contribution_minor" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'SEK' NOT NULL,
	"target_date" date,
	"priority" integer DEFAULT 3 NOT NULL,
	"sinking_fund_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_periods" ADD CONSTRAINT "budget_periods_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_period_id_budget_periods_id_fk" FOREIGN KEY ("budget_period_id") REFERENCES "public"."budget_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sinking_funds" ADD CONSTRAINT "sinking_funds_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sinking_funds" ADD CONSTRAINT "sinking_funds_linked_account_id_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_sinking_fund_id_sinking_funds_id_fk" FOREIGN KEY ("sinking_fund_id") REFERENCES "public"."sinking_funds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_periods_household_label" ON "budget_periods" USING btree ("household_id","label");--> statement-breakpoint
CREATE INDEX "budget_lines_period_idx" ON "budget_lines" USING btree ("budget_period_id");--> statement-breakpoint
CREATE INDEX "subscriptions_household_idx" ON "subscriptions" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "contracts_household_idx" ON "contracts" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "goals_household_idx" ON "goals" USING btree ("household_id");
