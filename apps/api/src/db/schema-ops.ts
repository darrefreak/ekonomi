import {
  bigint,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { households } from "./schema";

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
  currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
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
