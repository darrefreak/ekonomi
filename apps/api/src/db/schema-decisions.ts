import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { households } from "./schema";

export const opportunityStatusEnum = pgEnum("opportunity_status", [
  "NEW",
  "ACTIVE",
  "ACCEPTED",
  "DISMISSED",
  "COMPLETED",
  "VIEWED",
  "EXPIRED",
]);

export const riskLevelEnum = pgEnum("risk_level", [
  "LOW",
  "MODERATE",
  "HIGH",
  "CRITICAL",
]);

export const scenarioStatusEnum = pgEnum("scenario_status", [
  "DRAFT",
  "READY",
  "ARCHIVED",
]);

export const forecastRuns = pgTable("forecast_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  asOf: date("as_of").notNull(),
  horizonDays: integer("horizon_days").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const forecastPoints = pgTable("forecast_points", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  forecastRunId: uuid("forecast_run_id")
    .notNull()
    .references(() => forecastRuns.id, { onDelete: "cascade" }),
  onDate: date("on_date").notNull(),
  projectedCashMinor: bigint("projected_cash_minor", { mode: "bigint" }).notNull(),
  projectedNetWorthMinor: bigint("projected_net_worth_minor", { mode: "bigint" }).notNull(),
  label: varchar("label", { length: 80 }),
});

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    estimatedAnnualSavingMinor: bigint("estimated_annual_saving_minor", {
      mode: "bigint",
    }),
    currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).default("0.7"),
    effort: varchar("effort", { length: 40 }).notNull().default("medium"),
    risk: varchar("risk", { length: 40 }).notNull().default("low"),
    priority: integer("priority").notNull().default(3),
    status: opportunityStatusEnum("status").notNull().default("NEW"),
    category: varchar("category", { length: 80 }).notNull().default("general"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

    /** P1-U4 — deterministic opportunity engine fields (see 0023 migration). */
    type: varchar("type", { length: 64 }).notNull().default("OTHER"),
    detectorKey: varchar("detector_key", { length: 80 }).notNull().default("other"),
    /** Stable dedupe key: `${type}:${subjectId}`. Unique per household. */
    identityKey: varchar("identity_key", { length: 200 }).notNull().default(""),
    estimatedMonthlyImpactMinor: bigint("estimated_monthly_impact_minor", {
      mode: "bigint",
    }),
    estimateBasis: text("estimate_basis"),
    assumptions: jsonb("assumptions").$type<string[]>().notNull().default([]),
    facts: jsonb("facts")
      .$type<Array<{ key: string; label: string; value: string; amountMinor?: string }>>()
      .notNull()
      .default([]),
    dataSources: jsonb("data_sources").$type<string[]>().notNull().default([]),
    evidence: jsonb("evidence")
      .$type<Array<{ kind: string; id: string; label: string; href: string }>>()
      .notNull()
      .default([]),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }).default("0.5"),
    confidenceLabel: varchar("confidence_label", { length: 16 }).default("medium"),
    priorityScore: numeric("priority_score", { precision: 8, scale: 6 }).default("0"),
    calculationVersion: varchar("calculation_version", { length: 40 })
      .notNull()
      .default("opp-v1.0.0"),
    inputHash: varchar("input_hash", { length: 80 }).notNull().default(""),
    asOf: date("as_of"),
    validUntil: date("valid_until"),
    lastCalculatedAt: timestamp("last_calculated_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    subjectEntityId: uuid("subject_entity_id"),
  },
  (t) => [
    uniqueIndex("opportunities_household_identity_uidx").on(
      t.householdId,
      t.identityKey,
    ),
  ],
);

export const analysisRuns = pgTable(
  "analysis_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("READY"),
    asOf: date("as_of").notNull(),
    calculationVersion: varchar("calculation_version", { length: 40 }),
    jobId: varchar("job_id", { length: 120 }),
    errorCode: varchar("error_code", { length: 80 }),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("analysis_runs_household_kind_idx").on(
      t.householdId,
      t.kind,
      t.createdAt,
    ),
  ],
);

export const anomalyFindings = pgTable(
  "anomaly_findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    ruleKey: varchar("rule_key", { length: 80 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    detail: text("detail").notNull(),
    severity: varchar("severity", { length: 16 }).notNull().default("medium"),
    entityId: uuid("entity_id"),
    entityKind: varchar("entity_kind", { length: 40 }),
    amountMinor: bigint("amount_minor", { mode: "bigint" }),
    asOf: date("as_of").notNull(),
    facts: jsonb("facts")
      .$type<Array<{ key: string; label: string; value: string }>>()
      .notNull()
      .default([]),
    identityKey: varchar("identity_key", { length: 200 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("anomaly_findings_household_identity_uidx").on(
      t.householdId,
      t.identityKey,
    ),
  ],
);

export const riskSignals = pgTable("risk_signals", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  dimension: varchar("dimension", { length: 80 }).notNull(),
  level: riskLevelEnum("level").notNull().default("MODERATE"),
  title: varchar("title", { length: 200 }).notNull(),
  detail: text("detail").notNull(),
  score: integer("score").notNull().default(50),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const healthDimensions = pgTable("health_dimensions", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  dimension: varchar("dimension", { length: 80 }).notNull(),
  score: integer("score").notNull(),
  level: riskLevelEnum("level").notNull().default("MODERATE"),
  summary: text("summary").notNull(),
  asOf: date("as_of").notNull(),
});

export const scenarios = pgTable("scenarios", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description").notNull(),
  status: scenarioStatusEnum("status").notNull().default("READY"),
  assumptions: jsonb("assumptions").$type<Record<string, unknown>>().notNull().default({}),
  projectedMonthlyDeltaMinor: bigint("projected_monthly_delta_minor", {
    mode: "bigint",
  })
    .notNull()
    .default(0n),
  currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const forecastActualComparisons = pgTable(
  "forecast_actual_comparisons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    forecastRunId: uuid("forecast_run_id").references(() => forecastRuns.id, {
      onDelete: "set null",
    }),
    label: varchar("label", { length: 80 }).notNull(),
    onDate: date("on_date").notNull(),
    projectedCashMinor: bigint("projected_cash_minor", { mode: "bigint" }).notNull(),
    actualCashMinor: bigint("actual_cash_minor", { mode: "bigint" }).notNull(),
    projectedNetWorthMinor: bigint("projected_net_worth_minor", {
      mode: "bigint",
    }).notNull(),
    actualNetWorthMinor: bigint("actual_net_worth_minor", {
      mode: "bigint",
    }).notNull(),
    cashErrorMinor: bigint("cash_error_minor", { mode: "bigint" }).notNull(),
    netWorthErrorMinor: bigint("net_worth_error_minor", {
      mode: "bigint",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("forecast_actual_comparisons_household_idx").on(t.householdId)],
);

export const forecastAccuracyMetrics = pgTable(
  "forecast_accuracy_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    forecastRunId: uuid("forecast_run_id").references(() => forecastRuns.id, {
      onDelete: "set null",
    }),
    horizonLabel: varchar("horizon_label", { length: 80 }).notNull(),
    sampleCount: integer("sample_count").notNull().default(1),
    mapeCashPercent: numeric("mape_cash_percent", { precision: 10, scale: 4 }),
    mapeNetWorthPercent: numeric("mape_net_worth_percent", {
      precision: 10,
      scale: 4,
    }),
    absCashErrorMinor: bigint("abs_cash_error_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    absNetWorthErrorMinor: bigint("abs_net_worth_error_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("forecast_accuracy_metrics_household_idx").on(t.householdId)],
);
