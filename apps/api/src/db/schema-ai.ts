import {
  bigint,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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

/**
 * One external AI classification answer per cluster identity and version set.
 *
 * This is both the cache (§15) and the audit trail (§17): the unique index is
 * the cache key, and the row keeps hashes, usage and status — never the raw
 * prompt. Cascade delete from households covers erasure (§51).
 */
export const aiClassificationResults = pgTable(
  "ai_classification_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    signature: varchar("signature", { length: 160 }).notNull(),
    signatureVersion: varchar("signature_version", { length: 40 }).notNull(),
    direction: varchar("direction", { length: 8 }).notNull(),
    taxonomyVersion: varchar("taxonomy_version", { length: 80 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 80 }).notNull(),
    schemaVersion: varchar("schema_version", { length: 40 }).notNull(),
    provider: varchar("provider", { length: 40 }).notNull(),
    model: varchar("model", { length: 80 }).notNull(),
    /** SHA-256 of the minimized payload actually sent (or that would be sent). */
    inputHash: varchar("input_hash", { length: 64 }).notNull(),
    /** SHA-256 of the validated result JSON. */
    resultHash: varchar("result_hash", { length: 64 }).notNull(),
    /** APPLIED | SUGGESTED | UNKNOWN | REJECTED | ERROR */
    status: varchar("status", { length: 20 }).notNull(),
    /** Validated structured result. Null for ERROR rows. */
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    /** Combined confidence at decision time (model + deterministic evidence). */
    combinedConfidence: numeric("combined_confidence", { precision: 6, scale: 4 }),
    /** Why a result was rejected, or the error class. Never raw bank text. */
    failureReason: varchar("failure_reason", { length: 200 }),
    /** Token usage as reported by the provider, when available. */
    usage: jsonb("usage").$type<Record<string, number> | null>(),
    latencyMs: integer("latency_ms"),
    /** Times a later run reused this row instead of calling the provider. */
    hitCount: integer("hit_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ai_classification_results_identity").on(
      table.householdId,
      table.signature,
      table.direction,
      table.signatureVersion,
      table.taxonomyVersion,
      table.promptVersion,
      table.model,
    ),
  ],
);

/**
 * Persisted Financial Brief V2 snapshots (§45).
 *
 * A brief is regenerated only when its inputs change: the inputHash is the
 * identity. The stored brief is the validated response body minus the
 * per-request fields.
 */
export const financialBriefSnapshots = pgTable(
  "financial_brief_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    asOf: date("as_of").notNull(),
    inputHash: varchar("input_hash", { length: 64 }).notNull(),
    findingsVersion: varchar("findings_version", { length: 40 }).notNull(),
    templateVersion: varchar("template_version", { length: 40 }).notNull(),
    generator: varchar("generator", { length: 20 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 80 }),
    model: varchar("model", { length: 80 }),
    headline: varchar("headline", { length: 240 }).notNull(),
    brief: jsonb("brief").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("financial_brief_snapshots_identity").on(
      table.householdId,
      table.inputHash,
      table.findingsVersion,
      table.templateVersion,
      table.generator,
    ),
  ],
);

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
