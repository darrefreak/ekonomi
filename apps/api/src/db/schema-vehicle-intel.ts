import {
  bigint,
  boolean,
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
  index,
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

export const vehicleMarketListings = pgTable(
  "vehicle_market_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    subjectVehicleId: uuid("subject_vehicle_id").references(() => vehicles.id, {
      onDelete: "set null",
    }),
    externalKey: varchar("external_key", { length: 120 }).notNull(),
    make: varchar("make", { length: 80 }).notNull(),
    model: varchar("model", { length: 80 }).notNull(),
    variant: varchar("variant", { length: 80 }),
    modelYear: integer("model_year").notNull(),
    fuelType: varchar("fuel_type", { length: 40 }).notNull().default("petrol"),
    drivetrain: varchar("drivetrain", { length: 40 }),
    transmission: varchar("transmission", { length: 40 }),
    mileageKm: integer("mileage_km").notNull(),
    region: varchar("region", { length: 80 }),
    askPriceMinor: bigint("ask_price_minor", { mode: "bigint" }).notNull(),
    previousAskPriceMinor: bigint("previous_ask_price_minor", { mode: "bigint" }),
    priceKind: varchar("price_kind", { length: 40 }).notNull().default("ASKING_PRICE"),
    listedOn: date("listed_on").notNull(),
    removedOn: date("removed_on"),
    equipment: jsonb("equipment").$type<string[]>().notNull().default([]),
    currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
    source: varchar("source", { length: 80 }).notNull().default("mock_marketplace"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("vehicle_market_listings_household_external_uidx").on(
      t.householdId,
      t.externalKey,
    ),
    index("vehicle_market_listings_subject_idx").on(
      t.householdId,
      t.subjectVehicleId,
      t.listedOn,
    ),
  ],
);

export const vehicleMarketHistoryPoints = pgTable(
  "vehicle_market_history_points",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    subjectVehicleId: uuid("subject_vehicle_id").references(() => vehicles.id, {
      onDelete: "set null",
    }),
    asOf: date("as_of").notNull(),
    medianAskingPriceMinor: bigint("median_asking_price_minor", {
      mode: "bigint",
    }).notNull(),
    listingCount: integer("listing_count").notNull(),
    medianListingAgeDays: integer("median_listing_age_days"),
    priceReductionRate: numeric("price_reduction_rate", { precision: 6, scale: 4 }),
    currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
  },
  (t) => [
    uniqueIndex("vehicle_market_history_uidx").on(
      t.householdId,
      t.subjectVehicleId,
      t.asOf,
    ),
  ],
);

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
  status: varchar("status", { length: 40 }).notNull().default("ACTIVE"),
  variant: varchar("variant", { length: 80 }),
  fuelType: varchar("fuel_type", { length: 40 }).default("hybrid"),
  mileageKm: integer("mileage_km"),
  seats: integer("seats"),
  isofixCount: integer("isofix_count"),
  cargoOk: boolean("cargo_ok").notNull().default(true),
  towingOk: boolean("towing_ok").notNull().default(false),
  isElectric: boolean("is_electric").notNull().default(false),
  rangeKm: integer("range_km"),
  financingDownPaymentMinor: bigint("financing_down_payment_minor", {
    mode: "bigint",
  }),
  financingMonthlyMinor: bigint("financing_monthly_minor", { mode: "bigint" }),
  expectedValuationMidMinor: bigint("expected_valuation_mid_minor", {
    mode: "bigint",
  }),
  insuranceMonthlyMinor: bigint("insurance_monthly_minor", { mode: "bigint" }),
  taxAnnualMinor: bigint("tax_annual_minor", { mode: "bigint" }),
  energyMonthlyMinor: bigint("energy_monthly_minor", { mode: "bigint" }),
  serviceReserveMonthlyMinor: bigint("service_reserve_monthly_minor", {
    mode: "bigint",
  }),
  repairReserveMonthlyMinor: bigint("repair_reserve_monthly_minor", {
    mode: "bigint",
  }),
  holdingPeriodMonths: integer("holding_period_months").notNull().default(36),
  sourceListingId: uuid("source_listing_id"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vehicleHouseholdRequirements = pgTable(
  "vehicle_household_requirements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    seatsRequired: integer("seats_required").notNull().default(5),
    isofixRequired: integer("isofix_required").notNull().default(2),
    cargoRequired: boolean("cargo_required").notNull().default(true),
    towingRequired: boolean("towing_required").notNull().default(false),
    homeChargingAvailable: boolean("home_charging_available")
      .notNull()
      .default(false),
    minRangeKm: integer("min_range_km"),
    annualMileageKm: integer("annual_mileage_km").notNull().default(15_000),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("vehicle_household_requirements_household_uidx").on(t.householdId),
  ],
);

export const vehicleLeaseAgreements = pgTable("vehicle_lease_agreements", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").references(() => vehicleCandidates.id, {
    onDelete: "set null",
  }),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id, {
    onDelete: "set null",
  }),
  name: varchar("name", { length: 160 }).notNull(),
  initialFeeMinor: bigint("initial_fee_minor", { mode: "bigint" })
    .notNull()
    .default(0n),
  monthlyPaymentMinor: bigint("monthly_payment_minor", { mode: "bigint" }).notNull(),
  termMonths: integer("term_months").notNull(),
  allowedMileageKm: integer("allowed_mileage_km").notNull(),
  startOn: date("start_on").notNull(),
  endOn: date("end_on").notNull(),
  startMileageKm: integer("start_mileage_km").notNull().default(0),
  currentMileageKm: integer("current_mileage_km").notNull().default(0),
  excessPriceMinorPerKm: bigint("excess_price_minor_per_km", { mode: "bigint" })
    .notNull()
    .default(150n),
  serviceIncluded: boolean("service_included").notNull().default(true),
  insuranceIncluded: boolean("insurance_included").notNull().default(false),
  tiresIncluded: boolean("tires_included").notNull().default(false),
  expectedReturnCostMinor: bigint("expected_return_cost_minor", { mode: "bigint" })
    .notNull()
    .default(0n),
  earlyTerminationCostMinor: bigint("early_termination_cost_minor", {
    mode: "bigint",
  }),
  currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
