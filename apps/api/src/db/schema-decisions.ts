import {
  bigint,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
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

export const opportunities = pgTable("opportunities", {
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
});

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
