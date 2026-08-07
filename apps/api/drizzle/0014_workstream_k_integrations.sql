ALTER TABLE "data_sources" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
