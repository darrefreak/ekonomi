-- P1-U6: vehicle market listings, candidate depth, lease, household fit, merchant + outcome fields

CREATE TABLE IF NOT EXISTS "vehicle_market_listings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "subject_vehicle_id" uuid REFERENCES "vehicles"("id") ON DELETE SET NULL,
  "external_key" varchar(120) NOT NULL,
  "make" varchar(80) NOT NULL,
  "model" varchar(80) NOT NULL,
  "variant" varchar(80),
  "model_year" integer NOT NULL,
  "fuel_type" varchar(40) NOT NULL DEFAULT 'petrol',
  "drivetrain" varchar(40),
  "transmission" varchar(40),
  "mileage_km" integer NOT NULL,
  "region" varchar(80),
  "ask_price_minor" bigint NOT NULL,
  "previous_ask_price_minor" bigint,
  "price_kind" varchar(40) NOT NULL DEFAULT 'ASKING_PRICE',
  "listed_on" date NOT NULL,
  "removed_on" date,
  "equipment" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "currency" varchar(3) NOT NULL DEFAULT 'SEK',
  "source" varchar(80) NOT NULL DEFAULT 'mock_marketplace',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_market_listings_household_external_uidx"
  ON "vehicle_market_listings" ("household_id", "external_key");
CREATE INDEX IF NOT EXISTS "vehicle_market_listings_subject_idx"
  ON "vehicle_market_listings" ("household_id", "subject_vehicle_id", "listed_on");

CREATE TABLE IF NOT EXISTS "vehicle_market_history_points" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "subject_vehicle_id" uuid REFERENCES "vehicles"("id") ON DELETE SET NULL,
  "as_of" date NOT NULL,
  "median_asking_price_minor" bigint NOT NULL,
  "listing_count" integer NOT NULL,
  "median_listing_age_days" integer,
  "price_reduction_rate" numeric(6, 4),
  "currency" varchar(3) NOT NULL DEFAULT 'SEK'
);

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_market_history_uidx"
  ON "vehicle_market_history_points" ("household_id", "subject_vehicle_id", "as_of");

ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "status" varchar(40) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "variant" varchar(80);
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "fuel_type" varchar(40) DEFAULT 'hybrid';
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "mileage_km" integer;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "seats" integer;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "isofix_count" integer;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "cargo_ok" boolean NOT NULL DEFAULT true;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "towing_ok" boolean NOT NULL DEFAULT false;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "is_electric" boolean NOT NULL DEFAULT false;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "range_km" integer;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "financing_down_payment_minor" bigint;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "financing_monthly_minor" bigint;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "expected_valuation_mid_minor" bigint;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "insurance_monthly_minor" bigint;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "tax_annual_minor" bigint;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "energy_monthly_minor" bigint;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "service_reserve_monthly_minor" bigint;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "repair_reserve_monthly_minor" bigint;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "holding_period_months" integer NOT NULL DEFAULT 36;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "source_listing_id" uuid;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "archived_at" timestamptz;
ALTER TABLE "vehicle_candidates" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS "vehicle_household_requirements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "seats_required" integer NOT NULL DEFAULT 5,
  "isofix_required" integer NOT NULL DEFAULT 2,
  "cargo_required" boolean NOT NULL DEFAULT true,
  "towing_required" boolean NOT NULL DEFAULT false,
  "home_charging_available" boolean NOT NULL DEFAULT false,
  "min_range_km" integer,
  "annual_mileage_km" integer NOT NULL DEFAULT 15000,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_household_requirements_household_uidx"
  ON "vehicle_household_requirements" ("household_id");

CREATE TABLE IF NOT EXISTS "vehicle_lease_agreements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "candidate_id" uuid REFERENCES "vehicle_candidates"("id") ON DELETE SET NULL,
  "vehicle_id" uuid REFERENCES "vehicles"("id") ON DELETE SET NULL,
  "name" varchar(160) NOT NULL,
  "initial_fee_minor" bigint NOT NULL DEFAULT 0,
  "monthly_payment_minor" bigint NOT NULL,
  "term_months" integer NOT NULL,
  "allowed_mileage_km" integer NOT NULL,
  "start_on" date NOT NULL,
  "end_on" date NOT NULL,
  "start_mileage_km" integer NOT NULL DEFAULT 0,
  "current_mileage_km" integer NOT NULL DEFAULT 0,
  "excess_price_minor_per_km" bigint NOT NULL DEFAULT 150,
  "service_included" boolean NOT NULL DEFAULT true,
  "insurance_included" boolean NOT NULL DEFAULT false,
  "tires_included" boolean NOT NULL DEFAULT false,
  "expected_return_cost_minor" bigint NOT NULL DEFAULT 0,
  "early_termination_cost_minor" bigint,
  "currency" varchar(3) NOT NULL DEFAULT 'SEK',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "website" varchar(240);
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "normalized_tokens" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "user_verified" boolean NOT NULL DEFAULT false;
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();

ALTER TABLE "recommendation_outcomes" ADD COLUMN IF NOT EXISTS "expected_impact_basis" text;
ALTER TABLE "recommendation_outcomes" ADD COLUMN IF NOT EXISTS "verified_impact_minor" bigint;
ALTER TABLE "recommendation_outcomes" ADD COLUMN IF NOT EXISTS "verification_status" varchar(40) NOT NULL DEFAULT 'AWAITING_EVIDENCE';
ALTER TABLE "recommendation_outcomes" ADD COLUMN IF NOT EXISTS "verification_notes" text;
ALTER TABLE "recommendation_outcomes" ADD COLUMN IF NOT EXISTS "accepted_at" timestamptz;
ALTER TABLE "recommendation_outcomes" ADD COLUMN IF NOT EXISTS "completed_at" timestamptz;
ALTER TABLE "recommendation_outcomes" ADD COLUMN IF NOT EXISTS "next_review_at" timestamptz;
ALTER TABLE "recommendation_outcomes" ADD COLUMN IF NOT EXISTS "opportunity_id" uuid;
