import {
  bigint,
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { households } from "./schema";
import { accounts } from "./schema-economic";

export const vehicleOwnershipTypeEnum = pgEnum("vehicle_ownership_type", [
  "PRIVATE_OWNED",
  "FINANCED",
  "PRIVATE_LEASE",
  "COMPANY_OWNED",
  "BENEFIT_CAR",
  "SHARED",
  "OTHER",
]);

export const vehicleCostKindEnum = pgEnum("vehicle_cost_kind", [
  "PURCHASE_PRICE",
  "DEPRECIATION",
  "LOAN_PRINCIPAL",
  "LOAN_INTEREST",
  "FEE",
  "INSURANCE",
  "TAX",
  "INSPECTION",
  "SERVICE",
  "REPAIR",
  "TIRES",
  "ENERGY",
  "PARKING",
  "TOLL",
  "OTHER",
]);

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    make: varchar("make", { length: 80 }).notNull(),
    model: varchar("model", { length: 80 }).notNull(),
    modelYear: integer("model_year").notNull(),
    registrationNumber: varchar("registration_number", { length: 16 }),
    fuelType: varchar("fuel_type", { length: 40 }).notNull().default("petrol"),
    currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
    purchasePriceMinor: bigint("purchase_price_minor", { mode: "bigint" }),
    purchaseDate: date("purchase_date"),
    estimatedValueLowMinor: bigint("estimated_value_low_minor", { mode: "bigint" }),
    estimatedValueMidMinor: bigint("estimated_value_mid_minor", { mode: "bigint" }),
    estimatedValueHighMinor: bigint("estimated_value_high_minor", {
      mode: "bigint",
    }),
    valuationAsOf: date("valuation_as_of"),
    linkedAssetAccountId: uuid("linked_asset_account_id").references(
      () => accounts.id,
      { onDelete: "set null" },
    ),
    linkedLoanAccountId: uuid("linked_loan_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("vehicles_household_idx").on(t.householdId)],
);

export const vehicleOwnerships = pgTable("vehicle_ownerships", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  ownershipType: vehicleOwnershipTypeEnum("ownership_type")
    .notNull()
    .default("FINANCED"),
  ownerSharePercent: numeric("owner_share_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("100"),
  startedOn: date("started_on"),
  endedOn: date("ended_on"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vehicleUsageProfiles = pgTable("vehicle_usage_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  annualKm: integer("annual_km").notNull().default(15_000),
  commuteSharePercent: numeric("commute_share_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("60"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vehicleFinanceAgreements = pgTable("vehicle_finance_agreements", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  lender: varchar("lender", { length: 120 }).notNull(),
  principalMinor: bigint("principal_minor", { mode: "bigint" }).notNull(),
  remainingMinor: bigint("remaining_minor", { mode: "bigint" }).notNull(),
  interestRateBps: integer("interest_rate_bps").notNull(),
  monthlyPaymentMinor: bigint("monthly_payment_minor", { mode: "bigint" }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vehicleOdometerReadings = pgTable("vehicle_odometer_readings", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  readingKm: integer("reading_km").notNull(),
  recordedOn: date("recorded_on").notNull(),
  source: varchar("source", { length: 40 }).notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vehicleCostEvents = pgTable(
  "vehicle_cost_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    kind: vehicleCostKindEnum("kind").notNull(),
    occurredOn: date("occurred_on").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
    isEconomicCost: boolean("is_economic_cost").notNull().default(true),
    odometerKm: integer("odometer_km"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("vehicle_cost_events_vehicle_idx").on(t.vehicleId, t.occurredOn)],
);
