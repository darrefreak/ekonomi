ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "interest_rate_bps" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "binding_end_date" date;--> statement-breakpoint
UPDATE "accounts"
SET "interest_rate_bps" = 240,
    "binding_end_date" = '2027-06-30'
WHERE "account_type" = 'MORTGAGE'
  AND "interest_rate_bps" IS NULL;--> statement-breakpoint
UPDATE "accounts"
SET "interest_rate_bps" = COALESCE("interest_rate_bps", 495),
    "current_balance_minor" = ABS("current_balance_minor")
WHERE "account_type" = 'LOAN'
  AND "name" ILIKE 'Billån%';--> statement-breakpoint
