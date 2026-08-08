-- Batch R1: durable financial command idempotency (household + command type + external id).
-- Protects non-cash commands (e.g. depreciation) and races that find-before-insert cannot.

CREATE TABLE IF NOT EXISTS "financial_command_idempotency" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "command_type" varchar(80) NOT NULL,
  "external_id" varchar(160) NOT NULL,
  "payload_hash" varchar(64) NOT NULL,
  "financial_event_id" uuid NOT NULL REFERENCES "financial_events"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "financial_command_idempotency_key"
  ON "financial_command_idempotency" ("household_id", "command_type", "external_id");

CREATE INDEX IF NOT EXISTS "financial_command_idempotency_event"
  ON "financial_command_idempotency" ("financial_event_id");
