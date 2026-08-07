CREATE TABLE IF NOT EXISTS "privacy_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid REFERENCES "households"("id") ON DELETE SET NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" varchar(40) NOT NULL,
  "status" varchar(40) NOT NULL DEFAULT 'requested',
  "note" text,
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "privacy_requests_user_created_idx"
  ON "privacy_requests" ("user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "privacy_requests_household_created_idx"
  ON "privacy_requests" ("household_id", "created_at" DESC);
