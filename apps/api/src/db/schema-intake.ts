import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { households } from "./schema";
import { accounts, dataSources } from "./schema-economic";
import { vehicles } from "./schema-vehicles";

export const documentStatusEnum = pgEnum("document_status", [
  "NEW",
  "PROCESSING",
  "REVIEW",
  "ACTION_REQUIRED",
  "ARCHIVED",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "INVOICE",
  "INSURANCE",
  "TAX",
  "LOAN_STATEMENT",
  "ANNUAL_STATEMENT",
  "SALARY",
  "CONTRACT",
  "RECEIPT",
  "VEHICLE",
  "OTHER",
]);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    documentType: documentTypeEnum("document_type").notNull().default("OTHER"),
    status: documentStatusEnum("status").notNull().default("NEW"),
    issuer: varchar("issuer", { length: 160 }),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }),
    currency: varchar("currency", { length: 3 }).default("SEK"),
    extracted: jsonb("extracted").$type<Record<string, unknown>>().default({}),
    sourceName: varchar("source_name", { length: 120 }),
    notes: text("notes"),
    storageKey: varchar("storage_key", { length: 320 }),
    bucket: varchar("bucket", { length: 120 }),
    contentType: varchar("content_type", { length: 120 }),
    byteSize: integer("byte_size"),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    originalFilename: varchar("original_filename", { length: 260 }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, {
      onDelete: "set null",
    }),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("documents_household_idx").on(t.householdId, t.status),
    index("documents_vehicle_idx").on(t.vehicleId),
    index("documents_account_idx").on(t.accountId),
  ],
);

export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id").references(() => dataSources.id, {
    onDelete: "set null",
  }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: varchar("status", { length: 40 }).notNull().default("COMPLETED"),
  recordsFetched: integer("records_fetched").notNull().default(0),
  message: text("message"),
});
