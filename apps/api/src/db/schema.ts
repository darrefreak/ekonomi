import {
  boolean,
  date,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const householdRoleEnum = pgEnum("household_role", [
  "OWNER",
  "ADMIN",
  "ADULT",
  "VIEWER",
  "CHILD",
]);

export const accessPolicyEnum = pgEnum("access_policy", [
  "FULL_DETAILS",
  "AGGREGATES_ONLY",
  "BALANCE_ONLY",
  "OWNER_ONLY",
  "CUSTOM",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const households = pgTable("households", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  baseCurrency: varchar("base_currency", { length: 3 }).notNull().default("SEK"),
  /** Demo households only: frozen product date. NULL means "use the real clock". */
  demoAsOf: date("demo_as_of"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const householdMembers = pgTable("household_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: householdRoleEnum("role").notNull().default("ADULT"),
  personalDataPolicy: accessPolicyEnum("personal_data_policy")
    .notNull()
    .default("FULL_DETAILS"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Pending / accepted household invites (Mailpit SMTP in V1). */
export const householdInvitations = pgTable("household_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 320 }).notNull(),
  role: householdRoleEnum("role").notNull().default("ADULT"),
  token: varchar("token", { length: 64 }).notNull().unique(),
  status: varchar("status", { length: 40 }).notNull().default("PENDING"),
  invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const featureFlags = pgTable("feature_flags", {
  key: varchar("key", { length: 80 }).primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id"),
  actorUserId: uuid("actor_user_id"),
  action: varchar("action", { length: 120 }).notNull(),
  entity: varchar("entity", { length: 120 }).notNull(),
  entityId: varchar("entity_id", { length: 120 }),
  before: jsonb("before"),
  after: jsonb("after"),
  requestId: varchar("request_id", { length: 80 }),
  source: varchar("source", { length: 40 }).notNull().default("api"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
