import {
  bigint,
  date,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { households } from "./schema";

export const aiBriefs = pgTable("ai_briefs", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  asOf: date("as_of").notNull(),
  headline: varchar("headline", { length: 240 }).notNull(),
  body: jsonb("body").$type<Record<string, unknown>>().notNull(),
  toolTrace: jsonb("tool_trace").$type<Array<Record<string, unknown>>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const recommendationOutcomes = pgTable("recommendation_outcomes", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  recommendationKey: varchar("recommendation_key", { length: 120 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("SHOWN"),
  expectedImpactMinor: bigint("expected_impact_minor", { mode: "bigint" }),
  expectedImpactBasis: text("expected_impact_basis"),
  verifiedImpactMinor: bigint("verified_impact_minor", { mode: "bigint" }),
  verificationStatus: varchar("verification_status", { length: 40 })
    .notNull()
    .default("AWAITING_EVIDENCE"),
  verificationNotes: text("verification_notes"),
  currency: varchar("currency", { length: 3 }).default("SEK"),
  shownAt: timestamp("shown_at", { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
  opportunityId: uuid("opportunity_id"),
  notes: text("notes"),
});
