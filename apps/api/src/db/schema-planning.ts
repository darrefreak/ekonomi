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
  uniqueIndex,
  uuid,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { households } from "./schema";
import { accounts, categories, merchants } from "./schema-economic";

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

export const recurringItems = pgTable("recurring_items", {
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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
