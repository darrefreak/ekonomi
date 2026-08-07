import {
  bigint,
  date,
  integer,
  numeric,
  pgTable,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { households } from "./schema";
import { vehicles } from "./schema-vehicles";

export const vehicleMarketSnapshots = pgTable("vehicle_market_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  asOf: date("as_of").notNull(),
  askLowMinor: bigint("ask_low_minor", { mode: "bigint" }).notNull(),
  askMidMinor: bigint("ask_mid_minor", { mode: "bigint" }).notNull(),
  askHighMinor: bigint("ask_high_minor", { mode: "bigint" }).notNull(),
  sampleSize: integer("sample_size").notNull().default(12),
  currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
  notes: text("notes"),
});

export const vehicleCandidates = pgTable("vehicle_candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  make: varchar("make", { length: 80 }).notNull(),
  model: varchar("model", { length: 80 }).notNull(),
  modelYear: integer("model_year").notNull(),
  askPriceMinor: bigint("ask_price_minor", { mode: "bigint" }).notNull(),
  estimatedMonthlyEconomicMinor: bigint("estimated_monthly_economic_minor", {
    mode: "bigint",
  }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
  source: varchar("source", { length: 80 }).notNull().default("mock_market"),
  notes: text("notes"),
});

export const vehicleComparisons = pgTable("vehicle_comparisons", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  currentVehicleId: uuid("current_vehicle_id").references(() => vehicles.id, {
    onDelete: "set null",
  }),
  candidateId: uuid("candidate_id").references(() => vehicleCandidates.id, {
    onDelete: "set null",
  }),
  monthlyDeltaMinor: bigint("monthly_delta_minor", { mode: "bigint" }).notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).default("0.65"),
  recommendation: varchar("recommendation", { length: 40 }).notNull().default("hold"),
  summary: text("summary").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
});

export const vehicleReplacementPlans = pgTable("vehicle_replacement_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  sellWindowStart: date("sell_window_start"),
  sellWindowEnd: date("sell_window_end"),
  targetEquityMinor: bigint("target_equity_minor", { mode: "bigint" }),
  status: varchar("status", { length: 40 }).notNull().default("WATCH"),
  summary: text("summary").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
});
