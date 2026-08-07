import {
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { households } from "./schema";

/** Persisted catalog row mirrored from code-first METRIC_DEFINITIONS. */
export const metricDefinitions = pgTable(
  "metric_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    metricKey: varchar("metric_key", { length: 80 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    formulaDescription: text("formula_description").notNull(),
    calculationVersion: varchar("calculation_version", { length: 40 }).notNull(),
    valueKind: varchar("value_kind", { length: 40 }).notNull(),
    unit: varchar("unit", { length: 40 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("metric_definitions_key_version").on(
      t.metricKey,
      t.calculationVersion,
    ),
  ],
);

/** Rebuildable derived snapshot — ledger remains source of truth. */
export const metricSnapshots = pgTable(
  "metric_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    metricKey: varchar("metric_key", { length: 80 }).notNull(),
    calculationVersion: varchar("calculation_version", { length: 40 }).notNull(),
    asOf: varchar("as_of", { length: 10 }).notNull(),
    period: varchar("period", { length: 40 }),
    currency: varchar("currency", { length: 3 }),
    valueMinor: varchar("value_minor", { length: 40 }),
    valueNumber: numeric("value_number", { precision: 18, scale: 6 }),
    inputHash: varchar("input_hash", { length: 80 }),
    coveragePercent: integer("coverage_percent"),
    freshnessLabel: varchar("freshness_label", { length: 80 }),
    calculatedAt: timestamp("calculated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("metric_snapshots_household_key_asof_version").on(
      t.householdId,
      t.metricKey,
      t.asOf,
      t.calculationVersion,
    ),
  ],
);
