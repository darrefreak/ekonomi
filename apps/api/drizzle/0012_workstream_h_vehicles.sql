ALTER TABLE "financial_events"
  DROP CONSTRAINT IF EXISTS "financial_events_vehicle_id_vehicles_id_fk";--> statement-breakpoint
ALTER TABLE "transaction_splits"
  DROP CONSTRAINT IF EXISTS "transaction_splits_vehicle_id_vehicles_id_fk";--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "financial_events"
    ADD CONSTRAINT "financial_events_vehicle_id_vehicles_id_fk"
    FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "transaction_splits"
    ADD CONSTRAINT "transaction_splits_vehicle_id_vehicles_id_fk"
    FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_events_vehicle_idx"
  ON "financial_events" ("vehicle_id");--> statement-breakpoint
