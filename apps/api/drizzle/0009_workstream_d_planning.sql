CREATE TABLE IF NOT EXISTS "goal_contributions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE cascade,
  "goal_id" uuid NOT NULL REFERENCES "goals"("id") ON DELETE cascade,
  "amount_minor" bigint NOT NULL,
  "currency" varchar(3) DEFAULT 'SEK' NOT NULL,
  "contributed_on" date NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_contributions_goal_idx" ON "goal_contributions" ("goal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_contributions_household_idx" ON "goal_contributions" ("household_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sinking_fund_contributions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE cascade,
  "sinking_fund_id" uuid NOT NULL REFERENCES "sinking_funds"("id") ON DELETE cascade,
  "amount_minor" bigint NOT NULL,
  "currency" varchar(3) DEFAULT 'SEK' NOT NULL,
  "contributed_on" date NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sinking_fund_contributions_fund_idx" ON "sinking_fund_contributions" ("sinking_fund_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sinking_fund_contributions_household_idx" ON "sinking_fund_contributions" ("household_id");
