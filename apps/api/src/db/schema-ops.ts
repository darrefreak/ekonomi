import {
  bigint,
  boolean,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { households, users } from "./schema";

export const householdSettings = pgTable("household_settings", {
  householdId: uuid("household_id")
    .primaryKey()
    .references(() => households.id, { onDelete: "cascade" }),
  locale: varchar("locale", { length: 16 }).notNull().default("sv-SE"),
  appearance: varchar("appearance", { length: 16 }).notNull().default("system"),
  minimumCashBalanceMinor: bigint("minimum_cash_balance_minor", {
    mode: "bigint",
  })
    .notNull()
    .default(6_000_000n),
  emergencyFundTargetMinor: bigint("emergency_fund_target_minor", {
    mode: "bigint",
  })
    .notNull()
    .default(12_000_000n),
  safetyMarginMinor: bigint("safety_margin_minor", { mode: "bigint" })
    .notNull()
    .default(2_000_000n),
  /** Target net savings rate percent (0–100). */
  savingsRateTargetPercent: numeric("savings_rate_target_percent", {
    precision: 8,
    scale: 4,
  })
    .notNull()
    .default("20"),
  /** Max desired fixed-cost ratio percent (0–100). */
  maxFixedCostRatioPercent: numeric("max_fixed_cost_ratio_percent", {
    precision: 8,
    scale: 4,
  })
    .notNull()
    .default("50"),
  investmentContributionTargetMinor: bigint(
    "investment_contribution_target_minor",
    { mode: "bigint" },
  )
    .notNull()
    .default(0n),
  currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
  /**
   * Household opt-in for external AI transaction analysis (§21). Default off:
   * no cluster text leaves the system unless a person turned this on *and*
   * the environment allows it.
   */
  aiTransactionAnalysisEnabled: boolean("ai_transaction_analysis_enabled")
    .notNull()
    .default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 40 }).notNull().default("INFO"),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body"),
  href: varchar("href", { length: 240 }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Foundation for GDPR-style export/delete/leave workflows (async fulfillment later). */
export const privacyRequests = pgTable("privacy_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").references(() => households.id, {
    onDelete: "set null",
  }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 40 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("requested"),
  note: text("note"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
