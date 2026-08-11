import {
  bigint,
  boolean,
  date,
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
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { households } from "./schema";
import {
  accounts,
  categories,
  merchantClusters,
  merchants,
  sourceTransactions,
} from "./schema-economic";

export const budgetPeriodStatusEnum = pgEnum("budget_period_status", [
  "DRAFT",
  "ACTIVE",
  "CLOSED",
]);

export const recurringStatusEnum = pgEnum("recurring_status", [
  "DETECTED",
  "CONFIRMED",
  "DISMISSED",
  "PAUSED",
]);

export const recurringCadenceEnum = pgEnum("recurring_cadence", [
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
  /*
   * Added for the periodicity detector, which finds these in real statements.
   * A four-weekly charge is thirteen payments a year, not twelve, so it is stored
   * as itself rather than mapped onto MONTHLY.
   */
  "BIWEEKLY",
  "EVERY_4_WEEKS",
  "SEMIANNUAL",
  "ANNUAL",
  "VARIABLE_RECURRING",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "ACTIVE",
  "CANCELLED",
  "PAUSED",
  "TRIAL",
]);

export const contractStatusEnum = pgEnum("contract_status", [
  "ACTIVE",
  "ENDING",
  "EXPIRED",
  "CANCELLED",
]);

export const goalTypeEnum = pgEnum("goal_type", [
  "EMERGENCY_FUND",
  "INVESTMENT_TARGET",
  "DEBT_FREE",
  "HOME_PURCHASE",
  "CAR",
  "TRAVEL",
  "EDUCATION",
  "CUSTOM",
]);

export const goalStatusEnum = pgEnum("goal_status", [
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
]);

export const budgetPeriods = pgTable(
  "budget_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 40 }).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
    status: budgetPeriodStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("budget_periods_household_label").on(t.householdId, t.label)],
);

export const budgetLines = pgTable(
  "budget_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    budgetPeriodId: uuid("budget_period_id")
      .notNull()
      .references(() => budgetPeriods.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    categoryKey: varchar("category_key", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    plannedMinor: bigint("planned_minor", { mode: "bigint" }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("budget_lines_period_idx").on(t.budgetPeriodId)],
);

/** A material price regime change, minor units as strings for JSON safety. */
export type StoredPriceChange = {
  fromMinor: string;
  toMinor: string;
  changedOn: string;
  differenceMinor: string;
  percentChange: number | null;
};

/**
 * Recurring streams.
 *
 * Originally a manually-seeded table; now also the persistence target for the
 * deterministic recurrence detector. A detected stream's identity is
 * (household, signature, direction) — re-running analysis updates the same row.
 * Manual rows keep a NULL signature and are never touched by the detector.
 */
export const recurringItems = pgTable(
  "recurring_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    kind: varchar("kind", { length: 40 }).notNull().default("expense"),
    cadence: recurringCadenceEnum("cadence").notNull().default("MONTHLY"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    merchantId: uuid("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    status: recurringStatusEnum("status").notNull().default("DETECTED"),
    nextExpectedOn: date("next_expected_on"),
    lastSeenOn: date("last_seen_on"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).default("0.9"),
    notes: text("notes"),
    /** Detected-stream identity anchor; NULL for manually created rows. */
    signature: varchar("signature", { length: 200 }),
    signatureVersion: varchar("signature_version", { length: 20 }),
    clusterId: uuid("cluster_id").references(() => merchantClusters.id, {
      onDelete: "set null",
    }),
    direction: varchar("direction", { length: 16 }).notNull().default("OUTFLOW"),
    /** WHAT KIND (SUBSCRIPTION, UTILITY_BILL, SALARY, …); cadence is WHEN. */
    recurringType: varchar("recurring_type", { length: 30 }),
    isSubscription: boolean("is_subscription").notNull().default(false),
    /** NULL = detector decides; true/false = the household said so. */
    userMarkedSubscription: boolean("user_marked_subscription"),
    /** The household confirmed or dismissed this stream; reruns respect it. */
    userVerified: boolean("user_verified").notNull().default(false),
    occurrenceCount: integer("occurrence_count").notNull().default(0),
    firstSeenOn: date("first_seen_on"),
    medianAmountMinor: bigint("median_amount_minor", { mode: "bigint" }),
    minAmountMinor: bigint("min_amount_minor", { mode: "bigint" }),
    maxAmountMinor: bigint("max_amount_minor", { mode: "bigint" }),
    amountVolatilityBps: integer("amount_volatility_bps"),
    medianIntervalDays: integer("median_interval_days"),
    intervalSpreadDays: integer("interval_spread_days"),
    amountStable: boolean("amount_stable").notNull().default(false),
    priceChanges: jsonb("price_changes")
      .$type<StoredPriceChange[]>()
      .notNull()
      .default([]),
    originalAmountMinor: bigint("original_amount_minor", { mode: "bigint" }),
    annualPriceImpactMinor: bigint("annual_price_impact_minor", { mode: "bigint" }),
    evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
    detectionVersion: varchar("detection_version", { length: 20 }),
    firstDetectedAt: timestamp("first_detected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("recurring_items_stream_identity")
      .on(t.householdId, t.signature, t.direction)
      .where(sql`${t.signature} is not null`),
    index("recurring_items_household_status_idx").on(t.householdId, t.status),
  ],
);

export const expectedTransactionStatusEnum = pgEnum("expected_transaction_status", [
  "PENDING",
  "FULFILLED",
  "MISSED",
]);

/**
 * Expected future transactions projected from recurring streams.
 *
 * Forecasts only: an expectation never becomes a financial event, a posting or
 * a balance change. When a real transaction arrives it is matched to the
 * expectation, which is marked FULFILLED — the actual data is never duplicated.
 */
export const expectedTransactions = pgTable(
  "expected_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    recurringItemId: uuid("recurring_item_id")
      .notNull()
      .references(() => recurringItems.id, { onDelete: "cascade" }),
    expectedFrom: date("expected_from").notNull(),
    expectedTo: date("expected_to").notNull(),
    expectedAmountMinor: bigint("expected_amount_minor", { mode: "bigint" }).notNull(),
    expectedLowMinor: bigint("expected_low_minor", { mode: "bigint" }).notNull(),
    expectedHighMinor: bigint("expected_high_minor", { mode: "bigint" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
    direction: varchar("direction", { length: 16 }).notNull().default("OUTFLOW"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    status: expectedTransactionStatusEnum("status").notNull().default("PENDING"),
    matchedTransactionId: uuid("matched_transaction_id").references(
      () => sourceTransactions.id,
      { onDelete: "set null" },
    ),
    matchedOn: date("matched_on"),
    missedNotedAt: timestamp("missed_noted_at", { withTimezone: true }),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    modelVersion: varchar("model_version", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("expected_transactions_identity").on(t.recurringItemId, t.expectedFrom),
    index("expected_transactions_household_status_idx").on(
      t.householdId,
      t.status,
      t.expectedTo,
    ),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    merchantId: uuid("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    cadence: recurringCadenceEnum("cadence").notNull().default("MONTHLY"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
    status: subscriptionStatusEnum("status").notNull().default("ACTIVE"),
    firstDetectedOn: date("first_detected_on"),
    lastChargedOn: date("last_charged_on"),
    nextChargeOn: date("next_charge_on"),
    priceTrendPercent: numeric("price_trend_percent", { precision: 8, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("subscriptions_household_idx").on(t.householdId)],
);

export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 160 }).notNull(),
    contractType: varchar("contract_type", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    status: contractStatusEnum("status").notNull().default("ACTIVE"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    bindingPeriodEnd: date("binding_period_end"),
    renewalDate: date("renewal_date"),
    cancellationDeadline: date("cancellation_deadline"),
    noticePeriodDays: integer("notice_period_days"),
    monthlyCostMinor: bigint("monthly_cost_minor", { mode: "bigint" }),
    annualCostMinor: bigint("annual_cost_minor", { mode: "bigint" }),
    currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
    autoRenewal: boolean("auto_renewal").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("contracts_household_idx").on(t.householdId)],
);

export const sinkingFunds = pgTable("sinking_funds", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  categoryKey: varchar("category_key", { length: 80 }),
  targetMinor: bigint("target_minor", { mode: "bigint" }).notNull(),
  currentReservedMinor: bigint("current_reserved_minor", { mode: "bigint" })
    .notNull()
    .default(0n),
  monthlyContributionMinor: bigint("monthly_contribution_minor", { mode: "bigint" })
    .notNull()
    .default(0n),
  targetDate: date("target_date"),
  priority: integer("priority").notNull().default(3),
  currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
  linkedAccountId: uuid("linked_account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    goalType: goalTypeEnum("goal_type").notNull().default("CUSTOM"),
    status: goalStatusEnum("status").notNull().default("ACTIVE"),
    targetMinor: bigint("target_minor", { mode: "bigint" }).notNull(),
    currentMinor: bigint("current_minor", { mode: "bigint" }).notNull().default(0n),
    monthlyContributionMinor: bigint("monthly_contribution_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
    targetDate: date("target_date"),
    priority: integer("priority").notNull().default(3),
    sinkingFundId: uuid("sinking_fund_id").references(() => sinkingFunds.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("goals_household_idx").on(t.householdId)],
);

export const goalContributions = pgTable(
  "goal_contributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
    contributedOn: date("contributed_on").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("goal_contributions_goal_idx").on(t.goalId),
    index("goal_contributions_household_idx").on(t.householdId),
  ],
);

export const sinkingFundContributions = pgTable(
  "sinking_fund_contributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    sinkingFundId: uuid("sinking_fund_id")
      .notNull()
      .references(() => sinkingFunds.id, { onDelete: "cascade" }),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
    contributedOn: date("contributed_on").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("sinking_fund_contributions_fund_idx").on(t.sinkingFundId),
    index("sinking_fund_contributions_household_idx").on(t.householdId),
  ],
);
