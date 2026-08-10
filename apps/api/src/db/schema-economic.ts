import {
  bigint,
  boolean,
  date,
  index,
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
  // A statement import must be able to stop after parsing and before any
  // financial write, which the original four states could not express.
  "UPLOADED",
  "INSPECTING",
  "READY_FOR_REVIEW",
  "IMPORTING",
  "COMPLETED_WITH_WARNINGS",
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

export const importBatches = pgTable(
  "import_batches",
  {
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

    /* Statement imports: what the batch was. */
    provider: varchar("provider", { length: 80 }),
    format: varchar("format", { length: 80 }),
    formatVersion: integer("format_version"),
    fileName: varchar("file_name", { length: 260 }),
    /**
     * SHA-256 of the uploaded bytes. Audit and recognising a file the household
     * already uploaded — never the transaction dedupe key, because the same
     * transactions can arrive in a differently-cut export.
     */
    fileHash: varchar("file_hash", { length: 64 }),
    fileByteSize: integer("file_byte_size"),
    storageKey: varchar("storage_key", { length: 320 }),
    bucket: varchar("bucket", { length: 120 }),
    targetAccountId: uuid("target_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),

    /* Counts with statement meaning. */
    newRecords: integer("new_records").notNull().default(0),
    existingRecords: integer("existing_records").notNull().default(0),
    reviewRecords: integer("review_records").notNull().default(0),
    invalidRecords: integer("invalid_records").notNull().default(0),

    /* The period covered, and the source's own reconciliation verdict. */
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    balanceChainStatus: varchar("balance_chain_status", { length: 40 }),
    balanceChain: jsonb("balance_chain").$type<Record<string, unknown>>(),
    closingBalanceMinor: bigint("closing_balance_minor", { mode: "bigint" }),
    message: text("message"),
  },
  (t) => [
    index("import_batches_household_started_idx").on(t.householdId, t.startedAt),
    index("import_batches_file_hash_idx").on(t.householdId, t.fileHash),
  ],
);

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
    /** 1-based data-line index, so a preserved row can be named to the user. */
    rowNumber: integer("row_number"),
  },
  (t) => [
    uniqueIndex("raw_import_records_household_hash").on(t.householdId, t.hash),
    index("raw_import_records_batch_row_idx").on(t.importBatchId, t.rowNumber),
  ],
);

/**
 * Whether the household would still be paying this if income fell.
 *
 * A separate dimension from `kind`: that says expense/income/transfer, this says
 * how avoidable the cost is. The liquidity engine sizes a buffer on essentials,
 * so conflating the two would size it on everything.
 */
/**
 * How a transaction came to have the classification it has.
 *
 * The distinction the first acceptance run lacked: a transaction that fell back to
 * a default category is not "automatically classified", and counting it as such
 * produced a 100 % figure that described the test's own SQL rather than the
 * product.
 */
export const classificationSourceEnum = pgEnum("classification_source", [
  "USER_VERIFIED",
  "DETERMINISTIC_MATCH",
  "LEARNED_RULE",
  "AI_MATCH",
  "DEFAULTED",
  "UNKNOWN",
]);

export const categoryNecessityEnum = pgEnum("category_necessity", [
  "ESSENTIAL",
  "SEMI_DISCRETIONARY",
  "DISCRETIONARY",
  "UNKNOWN",
]);

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").references(() => households.id, {
    onDelete: "cascade",
  }),
  parentId: uuid("parent_id"),
  key: varchar("key", { length: 80 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  kind: varchar("kind", { length: 40 }).notNull().default("expense"),
  necessity: categoryNecessityEnum("necessity").notNull().default("UNKNOWN"),
  /** The household said so, which outranks the system default. */
  necessityUserSet: boolean("necessity_user_set").notNull().default(false),
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
  website: varchar("website", { length: 240 }),
  normalizedTokens: jsonb("normalized_tokens").$type<string[]>().notNull().default([]),
  userVerified: boolean("user_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

/**
 * One authoritative balance per account, per instant, PER SOURCE.
 *
 * Several writers legitimately describe the same account on the same day —
 * `nw_history_reconstruct`, `ledger_reconcile`, `ledger_reconstruct` and
 * `manual_opening` — and the history reader deliberately ranks them. So the
 * uniqueness that matches the domain is `(account_id, as_of, source)`, not
 * `(account_id, as_of)`. Without it two concurrent reconcile runs could both
 * delete and both insert, which is how 113 duplicate groups accumulated
 * (RT2-008). Writers upsert on this key rather than delete-then-insert.
 */
export const accountBalanceSnapshots = pgTable(
  "account_balance_snapshots",
  {
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
  },
  (t) => [
    uniqueIndex("account_balance_snapshot_identity").on(
      t.accountId,
      t.asOf,
      t.source,
    ),
  ],
);

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
    /**
     * The provider's own reference — SEB's `Verifikationsnummer`.
     *
     * Deliberately not `externalId`: SEB reuses it across unrelated
     * transactions, so it cannot carry identity on its own.
     */
    providerReference: varchar("provider_reference", { length: 160 }),
    /**
     * The balance the provider reported after this transaction.
     *
     * Evidence for reconciliation and for distinguishing two identical-looking
     * transactions. Never a posting, and never a competing balance truth.
     */
    reportedBalanceAfterMinor: bigint("reported_balance_after_minor", {
      mode: "bigint",
    }),
    /**
     * Why this row needs a person.
     *
     * Needs Review is derived from this table rather than stored in a queue, so
     * an import ambiguity has to live on the row itself.
     */
    reviewReason: varchar("review_reason", { length: 40 }),
    /** Deterministic grouping key, and the algorithm version that produced it. */
    signature: varchar("signature", { length: 200 }),
    signatureVersion: varchar("signature_version", { length: 20 }),
    classificationSource: classificationSourceEnum("classification_source")
      .notNull()
      .default("UNKNOWN"),
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
    index("source_tx_fingerprint_idx").on(t.householdId, t.accountId, t.fingerprint),
    index("source_tx_review_reason_idx").on(t.householdId, t.reviewReason),
    index("source_tx_account_date_amount_idx").on(
      t.accountId,
      t.bookingDate,
      t.amountMinor,
    ),
  ],
);

/**
 * Transactions that probably share an economic meaning.
 *
 * One row per signature per household per algorithm version, so re-running the
 * analysis updates a cluster rather than creating a second one.
 */
export const merchantClusters = pgTable(
  "merchant_clusters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    signature: varchar("signature", { length: 200 }).notNull(),
    signatureVersion: varchar("signature_version", { length: 20 }).notNull(),
    representativeDescriptions: jsonb("representative_descriptions")
      .$type<string[]>()
      .notNull()
      .default([]),
    transactionCount: integer("transaction_count").notNull().default(0),
    firstSeen: date("first_seen"),
    lastSeen: date("last_seen"),
    medianAmountMinor: bigint("median_amount_minor", { mode: "bigint" }),
    minAmountMinor: bigint("min_amount_minor", { mode: "bigint" }),
    maxAmountMinor: bigint("max_amount_minor", { mode: "bigint" }),
    direction: varchar("direction", { length: 16 }).notNull().default("OUTFLOW"),
    medianIntervalDays: integer("median_interval_days"),
    intervalSpreadDays: integer("interval_spread_days"),
    merchantId: uuid("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    merchantCandidate: varchar("merchant_candidate", { length: 200 }),
    merchantConfidence: numeric("merchant_confidence", { precision: 5, scale: 4 }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    classificationSource: classificationSourceEnum("classification_source")
      .notNull()
      .default("UNKNOWN"),
    /** A bare reference number with nothing identifying in it. */
    opaque: boolean("opaque").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("merchant_clusters_identity").on(
      t.householdId,
      t.signature,
      t.signatureVersion,
    ),
    index("merchant_clusters_household_count_idx").on(t.householdId, t.transactionCount),
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
    /** Resolved command key: client Idempotency-Key or source externalId. */
    externalId: varchar("external_id", { length: 160 }).notNull(),
    /** Which identity produced `externalId` — keeps the two namespaces apart. */
    keySource: varchar("key_source", { length: 20 }).notNull().default("external_id"),
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
      t.keySource,
      t.externalId,
    ),
  ],
);

/**
 * Durable command idempotency for aggregate commands that are not a single
 * financial event — creating an account, onboarding a vehicle and so on.
 *
 * `financial_command_idempotency` above keys a single `financial_event`; this
 * table keys a whole command whose result may be several rows across several
 * tables. Identity is (household, command type, client key), so the same
 * `Idempotency-Key` used for two different command types does not collide.
 *
 * `result` holds only the identity of what was created, never a rendered
 * response: a retry re-reads the entity so the caller always sees current
 * state rather than a frozen snapshot.
 */
export const commandIdempotency = pgTable(
  "command_idempotency",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    commandType: varchar("command_type", { length: 80 }).notNull(),
    /** Client command identity from the HTTP `Idempotency-Key` header. */
    idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
    /** Detects the same key being reused for different economics. */
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("command_idempotency_key").on(
      t.householdId,
      t.commandType,
      t.idempotencyKey,
    ),
  ],
);
