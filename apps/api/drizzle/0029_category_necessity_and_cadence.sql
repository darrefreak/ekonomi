-- Financial Intelligence integration: category necessity, and cadences the
-- detector can actually produce.
--
-- See docs/intelligence/FINANCIAL_INTELLIGENCE_INTEGRATION_PLAN.md.

-- 1. Necessity: a separate dimension from `kind`.
--
-- `kind` says whether a category is expense, income, transfer or other. Necessity
-- says whether the household would still be paying it if income fell. Overloading
-- `kind` would conflate two unrelated questions, so this is its own column.
DO $$ BEGIN
  CREATE TYPE "category_necessity" AS ENUM (
    'ESSENTIAL',
    'SEMI_DISCRETIONARY',
    'DISCRETIONARY',
    'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "necessity" "category_necessity" NOT NULL DEFAULT 'UNKNOWN';

-- Whether the household has said so themselves, which outranks the system default.
ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "necessity_user_set" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "categories_household_necessity_idx"
  ON "categories" ("household_id", "necessity");

-- 2. System defaults for the categories the product seeds.
--
-- Applied only where the household has not decided, so re-running this migration
-- can never overwrite a person's choice. Matched on the dot-key prefix, which is
-- the hierarchy the rest of the product uses.
UPDATE "categories" SET "necessity" = 'ESSENTIAL'
WHERE "necessity_user_set" = false
  AND (
    "key" = 'housing' OR "key" LIKE 'housing.%'
    OR "key" IN ('health', 'healthcare', 'childcare', 'insurance')
    OR "key" LIKE 'health.%' OR "key" LIKE 'childcare.%' OR "key" LIKE 'insurance.%'
    OR "key" = 'food.groceries'
  );

UPDATE "categories" SET "necessity" = 'SEMI_DISCRETIONARY'
WHERE "necessity_user_set" = false
  AND (
    "key" = 'transport' OR "key" LIKE 'transport.%'
    OR "key" = 'food'
    OR "key" = 'family' OR "key" LIKE 'family.%'
    OR "key" = 'shopping' OR "key" LIKE 'shopping.%'
  );

UPDATE "categories" SET "necessity" = 'DISCRETIONARY'
WHERE "necessity_user_set" = false
  AND (
    "key" = 'lifestyle' OR "key" LIKE 'lifestyle.%'
    OR "key" = 'food.restaurant' OR "key" = 'food.takeaway'
    OR "key" IN ('entertainment', 'travel')
    OR "key" LIKE 'entertainment.%' OR "key" LIKE 'travel.%'
  );

-- Income and transfers are not household costs, so necessity does not apply.
UPDATE "categories" SET "necessity" = 'UNKNOWN'
WHERE "necessity_user_set" = false AND "kind" IN ('income', 'transfer');

-- 3. Cadences the periodicity detector actually produces.
--
-- The enum held WEEKLY, MONTHLY, QUARTERLY and YEARLY, which cannot express a
-- four-weekly charge or a semiannual bill. Filing a four-weekly charge as monthly
-- would forecast twelve payments a year against thirteen in reality, so the values
-- are added rather than mapped onto the nearest existing one.
ALTER TYPE "recurring_cadence" ADD VALUE IF NOT EXISTS 'BIWEEKLY';
ALTER TYPE "recurring_cadence" ADD VALUE IF NOT EXISTS 'EVERY_4_WEEKS';
ALTER TYPE "recurring_cadence" ADD VALUE IF NOT EXISTS 'SEMIANNUAL';
ALTER TYPE "recurring_cadence" ADD VALUE IF NOT EXISTS 'ANNUAL';
ALTER TYPE "recurring_cadence" ADD VALUE IF NOT EXISTS 'VARIABLE_RECURRING';
