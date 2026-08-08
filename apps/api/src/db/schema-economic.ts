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
} from "drizzle-orm/pg-core";
import { households, householdMembers } from "./schema";

export const accountTypeEnum = pgEnum("account_type", [
  "CHECKING",
  "SAVINGS",
  "CREDIT_CARD",
  "CASH",
  "INVESTMENT",
  "MORTGAGE",
  "LOAN",
  "TAX_ACCOUNT",
  "PENSION",
  "CRYPTO",
  "OTHER",
  "EXPENSE",
  "INCOME",
  "ASSET",
]);

export const connectionStatusEnum = pgEnum("connection_status", [
  "CONNECTED",
  "SYNCING",
  "AUTH_REQUIRED",
  "DEGRADED",
  "ERROR",
  "DISCONNECTED",
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "PENDING",
  "BOOKED",
  "REVERSED",
  "CORRECTED",
  "CANCELLED",
]);

export const financialEventTypeEnum = pgEnum("financial_event_type", [
  "INCOME",
  "EXPENSE",
  "TRANSFER",
  "INVESTMENT",
  "LOAN_PRINCIPAL",
  "INTEREST",
  "FEE",
  "TAX",
  "REFUND",
  "REIMBURSEMENT",
  "ASSET_PURCHASE",
  "ASSET_SALE",
  "CREDIT_CARD_PURCHASE",
  "CREDIT_CARD_PAYMENT",
  "ADJUSTMENT",
  "UNKNOWN",
]);

export const postingSideEnum = pgEnum("posting_side", ["debit", "credit"]);

export const processingStatusEnum = pgEnum("processing_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "IGNORED",
]);

export const importBatchStatusEnum = pgEnum("import_batch_status", [
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "PARTIAL",
]);

export const dataSources = pgTable("data_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  providerId: varchar("provider_id", { length: 80 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  domain: varchar("domain", { length: 40 }).notNull(),
  protocol: varchar("protocol", { length: 40 }).notNull(),
  authenticationMethod: varchar("authentication_method", { length: 40 }).notNull(),
  connectionStatus: connectionStatusEnum("connection_status")
    .notNull()
    .default("CONNECTED"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  freshnessLabel: varchar("freshness_label", { length: 80 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const importBatches = pgTable("import_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id").references(() => dataSources.id, {
    onDelete: "set null",
  }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: importBatchStatusEnum("status").notNull().default("RUNNING"),
  totalRecords: integer("total_records").notNull().default(0),
  createdCount: integer("created_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  ignoredCount: integer("ignored_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
});

export const rawImportRecords = pgTable(
  "raw_import_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 80 }).notNull(),
    sourceId: uuid("source_id").references(() => dataSources.id, {
      onDelete: "set null",
    }),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    hash: varchar("hash", { length: 128 }).notNull(),
    processingStatus: processingStatusEnum("processing_status")
      .notNull()
      .default("PENDING"),
    schemaVersion: varchar("schema_version", { length: 40 }).notNull().default("1"),
  },
  (t) => [uniqueIndex("raw_import_records_household_hash").on(t.householdId, t.hash)],
);

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").references(() => households.id, {
    onDelete: "cascade",
  }),
  parentId: uuid("parent_id"),
  key: varchar("key", { length: 80 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  kind: varchar("kind", { length: 40 }).notNull().default("expense"),
  isSystem: boolean("is_system").notNull().default(true),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const merchants = pgTable("merchants", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  canonicalName: varchar("canonical_name", { length: 160 }).notNull(),
  aliases: jsonb("aliases").$type<string[]>().default([]),
  merchantCategory: varchar("merchant_category", { length: 80 }),
  country: varchar("country", { length: 2 }).default("SE"),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).default("1"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  provider: varchar("provider", { length: 80 }),
  ownerMemberId: uuid("owner_member_id").references(() => householdMembers.id, {
    onDelete: "set null",
  }),
  isShared: boolean("is_shared").notNull().default(true),
  currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
  accountType: accountTypeEnum("account_type").notNull(),
  externalReference: varchar("external_reference", { length: 160 }),
  sourceId: uuid("source_id").references(() => dataSources.id, {
    onDelete: "set null",
  }),
  creditLimitMinor: bigint("credit_limit_minor", { mode: "bigint" }),
  /** Opening balance for ledger reconstruction (authoritative start). */
  openingBalanceMinor: bigint("opening_balance_minor", { mode: "bigint" })
    .notNull()
    .default(0n),
  /**
   * Derived cache of ledger-calculated ending balance.
   * Must be refreshed from postings; never an independent competing truth.
   */
  currentBalanceMinor: bigint("current_balance_minor", { mode: "bigint" })
    .notNull()
    .default(0n),
  /** Optional provider/bank-reported balance for reconciliation. */
  reportedBalanceMinor: bigint("reported_balance_minor", { mode: "bigint" }),
  /** Annual nominal interest rate in basis points (e.g. 240 = 2.40%). */
  interestRateBps: integer("interest_rate_bps"),
  bindingEndDate: date("binding_end_date"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  connectionStatus: connectionStatusEnum("connection_status")
    .notNull()
    .default("CONNECTED"),
  isSystem: boolean("is_system").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accountBalanceSnapshots = pgTable("account_balance_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  reportedBalanceMinor: bigint("reported_balance_minor", { mode: "bigint" }),
  availableBalanceMinor: bigint("available_balance_minor", { mode: "bigint" }),
  ledgerCalculatedBalanceMinor: bigint("ledger_calculated_balance_minor", {
    mode: "bigint",
  }),
  reconciledBalanceMinor: bigint("reconciled_balance_minor", { mode: "bigint" }),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  source: varchar("source", { length: 40 }).notNull().default("seed"),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).default("1"),
  userVerified: boolean("user_verified").notNull().default(false),
  isEstimated: boolean("is_estimated").notNull().default(false),
});

export const sourceTransactions = pgTable(
  "source_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 160 }),
    fingerprint: varchar("fingerprint", { length: 128 }),
    bookingDate: date("booking_date").notNull(),
    valueDate: date("value_date"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
    description: text("description"),
    rawDescription: text("raw_description"),
    merchantId: uuid("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    status: transactionStatusEnum("status").notNull().default("BOOKED"),
    sourceId: uuid("source_id").references(() => dataSources.id, {
      onDelete: "set null",
    }),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    sourceRecordId: uuid("source_record_id").references(() => rawImportRecords.id, {
      onDelete: "set null",
    }),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).default("1"),
    isRecurring: boolean("is_recurring").notNull().default(false),
    isInternalTransfer: boolean("is_internal_transfer").notNull().default(false),
    transferGroupId: uuid("transfer_group_id"),
    isExcluded: boolean("is_excluded").notNull().default(false),
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("source_tx_household_external").on(
      t.householdId,
      t.accountId,
      t.externalId,
    ),
  ],
);

export const financialEvents = pgTable("financial_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  eventType: financialEventTypeEnum("event_type").notNull(),
  occurredOn: date("occurred_on").notNull(),
  description: text("description"),
  currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
  expenseAmountMinor: bigint("expense_amount_minor", { mode: "bigint" })
    .notNull()
    .default(0n),
  incomeAmountMinor: bigint("income_amount_minor", { mode: "bigint" })
    .notNull()
    .default(0n),
  debtReductionMinor: bigint("debt_reduction_minor", { mode: "bigint" })
    .notNull()
    .default(0n),
  netWorthDeltaMinor: bigint("net_worth_delta_minor", { mode: "bigint" })
    .notNull()
    .default(0n),
  merchantId: uuid("merchant_id").references(() => merchants.id, {
    onDelete: "set null",
  }),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  vehicleId: uuid("vehicle_id"),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).default("1"),
  userVerified: boolean("user_verified").notNull().default(false),
  sourceType: varchar("source_type", { length: 40 }).default("seed"),
  /** ACTIVE | REVERSED | CORRECTED — only ACTIVE participates in reconstruct/period totals. */
  status: varchar("status", { length: 40 }).notNull().default("ACTIVE"),
  importBatchId: uuid("import_batch_id").references(() => importBatches.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sourceTransactionLinks = pgTable("source_transaction_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  sourceTransactionId: uuid("source_transaction_id")
    .notNull()
    .references(() => sourceTransactions.id, { onDelete: "cascade" }),
  financialEventId: uuid("financial_event_id")
    .notNull()
    .references(() => financialEvents.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 40 }).notNull().default("primary"),
});

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  financialEventId: uuid("financial_event_id")
    .notNull()
    .references(() => financialEvents.id, { onDelete: "cascade" }),
  bookedOn: date("booked_on").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ledgerPostings = pgTable("ledger_postings", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  ledgerEntryId: uuid("ledger_entry_id")
    .notNull()
    .references(() => ledgerEntries.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  side: postingSideEnum("side").notNull(),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
  memo: text("memo"),
});

export const transactionSplits = pgTable("transaction_splits", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  financialEventId: uuid("financial_event_id")
    .notNull()
    .references(() => financialEvents.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("SEK"),
  vehicleId: uuid("vehicle_id"),
  memo: text("memo"),
});

export const reconciliationGroups = pgTable("reconciliation_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 40 }).notNull().default("transfer"),
  status: varchar("status", { length: 40 }).notNull().default("suggested"),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).default("0.9"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Durable command idempotency for financial mutations.
 * Key: (household_id, command_type, external_id). payload_hash detects key reuse with different economics.
 */
export const financialCommandIdempotency = pgTable(
  "financial_command_idempotency",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    commandType: varchar("command_type", { length: 80 }).notNull(),
    externalId: varchar("external_id", { length: 160 }).notNull(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    financialEventId: uuid("financial_event_id")
      .notNull()
      .references(() => financialEvents.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("financial_command_idempotency_key").on(
      t.householdId,
      t.commandType,
      t.externalId,
    ),
  ],
);
