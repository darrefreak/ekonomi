CREATE TABLE IF NOT EXISTS "household_settings" (
  "household_id" uuid PRIMARY KEY REFERENCES "households"("id") ON DELETE CASCADE,
  "locale" varchar(16) NOT NULL DEFAULT 'sv-SE',
  "appearance" varchar(16) NOT NULL DEFAULT 'system',
  "minimum_cash_balance_minor" bigint NOT NULL DEFAULT 6000000,
  "emergency_fund_target_minor" bigint NOT NULL DEFAULT 12000000,
  "safety_margin_minor" bigint NOT NULL DEFAULT 2000000,
  "currency" varchar(3) NOT NULL DEFAULT 'SEK',
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "type" varchar(40) NOT NULL DEFAULT 'INFO',
  "title" varchar(200) NOT NULL,
  "body" text,
  "href" varchar(240),
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "notifications_household_created_idx"
  ON "notifications" ("household_id", "created_at" DESC);
