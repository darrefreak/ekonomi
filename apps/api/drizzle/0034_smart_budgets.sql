-- Product Experience V2: Smart Budget.
--
-- One row per household per month holds the ADOPTED plan (the six group
-- amounts the user accepted or adjusted). The suggestion itself is never
-- stored — it is recomputed deterministically from history on every read, so
-- it can improve as data improves while the user's decision stays fixed.

CREATE TABLE "smart_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"month" varchar(7) NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "smart_budgets" ADD CONSTRAINT "smart_budgets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "smart_budgets_household_month_idx" ON "smart_budgets" USING btree ("household_id","month");
