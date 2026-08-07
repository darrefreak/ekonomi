CREATE TABLE "ai_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"headline" varchar(240) NOT NULL,
	"body" jsonb NOT NULL,
	"tool_trace" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"recommendation_key" varchar(120) NOT NULL,
	"title" varchar(200) NOT NULL,
	"status" varchar(40) DEFAULT 'SHOWN' NOT NULL,
	"expected_impact_minor" bigint,
	"currency" varchar(3) DEFAULT 'SEK',
	"shown_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "ai_briefs" ADD CONSTRAINT "ai_briefs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_outcomes" ADD CONSTRAINT "recommendation_outcomes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
