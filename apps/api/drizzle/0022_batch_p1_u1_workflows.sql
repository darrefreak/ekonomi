-- P1-U1: category archive, expanded financial policies, household invitations

ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "archived_at" timestamptz;

ALTER TABLE "household_settings"
  ADD COLUMN IF NOT EXISTS "savings_rate_target_percent" numeric(8, 4) NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "max_fixed_cost_ratio_percent" numeric(8, 4) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "investment_contribution_target_minor" bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "household_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "email" varchar(320) NOT NULL,
  "role" "household_role" NOT NULL DEFAULT 'ADULT',
  "token" varchar(64) NOT NULL,
  "status" varchar(40) NOT NULL DEFAULT 'PENDING',
  "invited_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "accepted_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "expires_at" timestamptz NOT NULL,
  "accepted_at" timestamptz,
  "cancelled_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "household_invitations_token_uidx"
  ON "household_invitations" ("token");

CREATE INDEX IF NOT EXISTS "household_invitations_household_status_idx"
  ON "household_invitations" ("household_id", "status");
