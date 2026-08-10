ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "storage_key" varchar(320);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "bucket" varchar(120);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "content_type" varchar(120);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "byte_size" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "checksum_sha256" varchar(64);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "original_filename" varchar(260);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "vehicle_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "account_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "documents"
    ADD CONSTRAINT "documents_vehicle_id_vehicles_id_fk"
    FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "documents"
    ADD CONSTRAINT "documents_account_id_accounts_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_vehicle_idx" ON "documents" ("vehicle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_account_idx" ON "documents" ("account_id");--> statement-breakpoint
