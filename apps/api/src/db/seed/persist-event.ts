import { createHash } from "node:crypto";
import type { BalancedLedgerDraft } from "@ffos/financial-engine";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, type Db, type DbExecutor } from "../client";
import { auditLogs } from "../schema";
import {
  financialCommandIdempotency,
  financialEvents,
  ledgerEntries,
  ledgerPostings,
  reconciliationGroups,
  sourceTransactionLinks,
  sourceTransactions,
  transactionSplits,
} from "../schema-economic";

export type PersistSplit = {
  categoryId?: string;
  amountMinor: bigint;
  memo?: string;
};

export type PersistCounterpartTx = {
  accountId: string;
  amountMinor: bigint;
  externalId?: string;
};

/** Test-only failure injection points inside the persist transaction. */
export type PersistFailPoint =
  | "after_event"
  | "after_entry"
  | "before_final_posting"
  | "after_first_split";

export type FinancialCommandType =
  | "INTERNAL_TRANSFER"
  | "CREDIT_CARD_PURCHASE"
  | "CREDIT_CARD_PAYMENT"
  | "MORTGAGE_PAYMENT"
  | "INVESTMENT_TRANSFER"
  | "CASH_REFUND"
  | "ASSET_DEPRECIATION"
  | "LEDGER_EVENT"
  | "REPLACE_SPLITS"
  | "REVISE_CLASSIFICATION";

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";
  constructor(message = "Idempotency key reused with a different payload.") {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export class FinancialCommandFailedError extends Error {
  readonly code = "FINANCIAL_COMMAND_FAILED";
  constructor(message = "Financial command failed.") {
    super(message);
    this.name = "FinancialCommandFailedError";
  }
}

export type PersistBalancedEventInput = {
  householdId: string;
  draft: BalancedLedgerDraft;
  occurredOn: string;
  description: string;
  incomeAmountMinor?: bigint;
  categoryId?: string;
  merchantId?: string;
  /** Free-text note attached to the primary source transaction (not hashed for idempotency). */
  notes?: string;
  vehicleId?: string;
  sourceAccountId?: string;
  sourceAmountMinor?: bigint;
  isInternalTransfer?: boolean;
  transferGroupId?: string;
  importBatchId?: string;
  externalId?: string;
  /**
   * Client command identity (HTTP `Idempotency-Key`). Independent of
   * `externalId`, which is source-provider identity, so manual user commands
   * are protected without inventing a fake source id.
   */
  idempotencyKey?: string;
  /** Provenance for the financial event (seed | api | import | …). */
  sourceType?: string;
  /** Logical command type for idempotency (defaults from sourceType). */
  commandType?: FinancialCommandType;
  /** Destination bank leg for internal transfers. */
  counterpartTx?: PersistCounterpartTx;
  splits?: PersistSplit[];
  createReconciliationGroup?: boolean;
  /** When set, write a financial audit row in the same transaction. */
  audit?: {
    action: string;
    entity?: string;
    actorUserId?: string | null;
    requestId?: string | null;
    source?: string;
    after?: Record<string, unknown> | null;
  };
  /**
   * Test-only: force failure after a named step so the transaction rolls back.
   * Production callers must never set this.
   */
  failPoint?: PersistFailPoint;
  /** Optional shared transaction / executor. When omitted, opens one transaction. */
  executor?: DbExecutor;
};

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  if (code === "23505") return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object" && (cause as { code?: string }).code === "23505") {
    return true;
  }
  const message = String((err as { message?: string }).message ?? "");
  return message.includes("duplicate key") || message.includes("23505");
}

export function hashFinancialCommandPayload(parts: Record<string, unknown>): string {
  const canonical = JSON.stringify(parts, (_, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  return createHash("sha256").update(canonical).digest("hex");
}

function payloadHashForPersist(input: PersistBalancedEventInput): string {
  return hashFinancialCommandPayload({
    commandType: input.commandType ?? "LEDGER_EVENT",
    eventType: input.draft.eventType,
    occurredOn: input.occurredOn,
    expenseAmountMinor: input.draft.expenseAmountMinor.toString(),
    incomeAmountMinor: (input.incomeAmountMinor ?? 0n).toString(),
    debtReductionMinor: input.draft.debtReductionMinor.toString(),
    netWorthDeltaMinor: input.draft.netWorthDeltaMinor.toString(),
    postings: input.draft.postings.map((p) => ({
      accountId: p.accountId,
      side: p.side,
      amountMinor: p.amountMinor.toString(),
      currency: p.currency,
    })),
    sourceAccountId: input.sourceAccountId ?? null,
    sourceAmountMinor: input.sourceAmountMinor?.toString() ?? null,
    counterpartAccountId: input.counterpartTx?.accountId ?? null,
    counterpartAmountMinor: input.counterpartTx?.amountMinor?.toString() ?? null,
    vehicleId: input.vehicleId ?? null,
    splits: (input.splits ?? []).map((s) => ({
      categoryId: s.categoryId ?? null,
      amountMinor: s.amountMinor.toString(),
      memo: s.memo ?? null,
    })),
  });
}

export type CommandKeySource = "idempotency_key" | "external_id";

export type ResolvedCommandKey = {
  key: string;
  keySource: CommandKeySource;
};

/**
 * Command identity for idempotency. A client `Idempotency-Key` wins over source
 * `externalId` so retries of a manual command collapse to one economic effect.
 */
function resolveCommandKey(
  input: Pick<PersistBalancedEventInput, "idempotencyKey" | "externalId">,
): ResolvedCommandKey | null {
  if (input.idempotencyKey) {
    return { key: input.idempotencyKey, keySource: "idempotency_key" };
  }
  if (input.externalId) {
    return { key: input.externalId, keySource: "external_id" };
  }
  return null;
}

async function loadEventById(db: DbExecutor, eventId: string) {
  const [event] = await db
    .select()
    .from(financialEvents)
    .where(eq(financialEvents.id, eventId))
    .limit(1);
  return event ?? null;
}

async function lookupIdempotentEvent(
  db: DbExecutor,
  householdId: string,
  commandType: string,
  commandKey: ResolvedCommandKey,
  payloadHash: string,
) {
  const [row] = await db
    .select()
    .from(financialCommandIdempotency)
    .where(
      and(
        eq(financialCommandIdempotency.householdId, householdId),
        eq(financialCommandIdempotency.commandType, commandType),
        eq(financialCommandIdempotency.keySource, commandKey.keySource),
        eq(financialCommandIdempotency.externalId, commandKey.key),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (row.payloadHash !== payloadHash) {
    throw new IdempotencyConflictError();
  }
  const event = await loadEventById(db, row.financialEventId);
  if (!event) {
    throw new FinancialCommandFailedError(
      "Idempotency record exists without financial event.",
    );
  }
  return event;
}

async function persistBalancedEventInTx(
  db: DbExecutor,
  input: PersistBalancedEventInput,
) {
  const sourceType = input.sourceType ?? "seed";
  const commandType = input.commandType ?? "LEDGER_EVENT";
  const payloadHash = payloadHashForPersist(input);
  const commandKey = resolveCommandKey(input);

  if (commandKey) {
    const existing = await lookupIdempotentEvent(
      db,
      input.householdId,
      commandType,
      commandKey,
      payloadHash,
    );
    if (existing) return existing;
  }

  const [event] = await db
    .insert(financialEvents)
    .values({
      householdId: input.householdId,
      eventType: input.draft.eventType,
      occurredOn: input.occurredOn,
      description: input.description,
      currency: "SEK",
      expenseAmountMinor: input.draft.expenseAmountMinor,
      incomeAmountMinor: input.incomeAmountMinor ?? 0n,
      debtReductionMinor: input.draft.debtReductionMinor,
      netWorthDeltaMinor: input.draft.netWorthDeltaMinor,
      categoryId: input.categoryId,
      merchantId: input.merchantId,
      vehicleId: input.vehicleId,
      sourceType,
      importBatchId: input.importBatchId,
      userVerified: true,
      confidence: "1",
    })
    .returning();

  if (input.failPoint === "after_event") {
    throw new FinancialCommandFailedError("Injected failure after financial event");
  }

  const [entry] = await db
    .insert(ledgerEntries)
    .values({
      householdId: input.householdId,
      financialEventId: event.id,
      bookedOn: input.occurredOn,
      currency: "SEK",
      memo: input.description,
    })
    .returning();

  if (input.failPoint === "after_entry") {
    throw new FinancialCommandFailedError("Injected failure after ledger entry");
  }

  const postings = input.draft.postings;
  for (let i = 0; i < postings.length; i++) {
    if (
      input.failPoint === "before_final_posting" &&
      i === postings.length - 1
    ) {
      throw new FinancialCommandFailedError(
        "Injected failure before final posting",
      );
    }
    const posting = postings[i]!;
    await db.insert(ledgerPostings).values({
      householdId: input.householdId,
      ledgerEntryId: entry.id,
      accountId: posting.accountId,
      side: posting.side,
      amountMinor: posting.amountMinor,
      currency: posting.currency,
      memo: posting.memo,
    });
  }

  let reconciliationGroupId: string | undefined;
  if (input.createReconciliationGroup || input.counterpartTx) {
    const [group] = await db
      .insert(reconciliationGroups)
      .values({
        householdId: input.householdId,
        kind: input.isInternalTransfer ? "transfer" : "event",
        status: "matched",
        confidence: "1",
      })
      .returning();
    reconciliationGroupId = group.id;
  }

  if (input.sourceAccountId && input.sourceAmountMinor !== undefined) {
    const [tx] = await db
      .insert(sourceTransactions)
      .values({
        householdId: input.householdId,
        accountId: input.sourceAccountId,
        externalId: input.externalId ?? `${sourceType}-${event.id}`,
        fingerprint: `fp-${event.id}`,
        bookingDate: input.occurredOn,
        valueDate: input.occurredOn,
        amountMinor: input.sourceAmountMinor,
        currency: "SEK",
        description: input.description,
        rawDescription: input.description,
        merchantId: input.merchantId,
        categoryId: input.categoryId,
        notes: input.notes ?? null,
        status: "BOOKED",
        importBatchId: input.importBatchId,
        isInternalTransfer: input.isInternalTransfer ?? false,
        transferGroupId: input.transferGroupId ?? reconciliationGroupId,
        confidence: "1",
      })
      .returning();

    await db.insert(sourceTransactionLinks).values({
      householdId: input.householdId,
      sourceTransactionId: tx.id,
      financialEventId: event.id,
      role: "primary",
    });
  }

  if (input.counterpartTx) {
    const [tx] = await db
      .insert(sourceTransactions)
      .values({
        householdId: input.householdId,
        accountId: input.counterpartTx.accountId,
        externalId:
          input.counterpartTx.externalId ??
          `${sourceType}-${event.id}-counterpart`,
        fingerprint: `fp-${event.id}-counterpart`,
        bookingDate: input.occurredOn,
        valueDate: input.occurredOn,
        amountMinor: input.counterpartTx.amountMinor,
        currency: "SEK",
        description: input.description,
        rawDescription: input.description,
        status: "BOOKED",
        importBatchId: input.importBatchId,
        isInternalTransfer: true,
        transferGroupId: input.transferGroupId ?? reconciliationGroupId,
        confidence: "1",
      })
      .returning();

    await db.insert(sourceTransactionLinks).values({
      householdId: input.householdId,
      sourceTransactionId: tx.id,
      financialEventId: event.id,
      role: "counterpart",
    });
  }

  if (input.splits?.length) {
    for (let i = 0; i < input.splits.length; i++) {
      if (input.failPoint === "after_first_split" && i === 1) {
        throw new FinancialCommandFailedError(
          "Injected failure after first split",
        );
      }
      const split = input.splits[i]!;
      if (split.amountMinor <= 0n) {
        throw new FinancialCommandFailedError(
          "Split amountMinor must be positive",
        );
      }
      await db.insert(transactionSplits).values({
        householdId: input.householdId,
        financialEventId: event.id,
        categoryId: split.categoryId,
        amountMinor: split.amountMinor,
        currency: "SEK",
        memo: split.memo,
        vehicleId: input.vehicleId,
      });
    }
  }

  if (commandKey) {
    await db.insert(financialCommandIdempotency).values({
      householdId: input.householdId,
      commandType,
      externalId: commandKey.key,
      keySource: commandKey.keySource,
      payloadHash,
      financialEventId: event.id,
    });
  }

  if (input.audit) {
    await db.insert(auditLogs).values({
      householdId: input.householdId,
      actorUserId: input.audit.actorUserId ?? null,
      action: input.audit.action,
      entity: input.audit.entity ?? "financial_event",
      entityId: event.id,
      before: null,
      after: input.audit.after ?? { asOf: input.occurredOn, eventId: event.id },
      requestId: input.audit.requestId ?? null,
      source: input.audit.source ?? "api",
    });
  }

  return event;
}

/**
 * Persist a balanced financial event + ledger entry + postings (+ optional links/splits)
 * inside a single Postgres transaction.
 */
export async function persistBalancedEvent(input: PersistBalancedEventInput) {
  const commandType = input.commandType ?? "LEDGER_EVENT";
  const payloadHash = payloadHashForPersist(input);
  const commandKey = resolveCommandKey(input);

  const run = async (executor: DbExecutor) =>
    persistBalancedEventInTx(executor, input);

  try {
    if (input.executor) {
      return await run(input.executor);
    }
    return await getDb().transaction(async (tx) => run(tx));
  } catch (err) {
    // Concurrent same-key submissions: the unique index lets exactly one
    // transaction commit; losers resolve to the winner's event.
    if (commandKey && isUniqueViolation(err)) {
      const existing = await lookupIdempotentEvent(
        getDb(),
        input.householdId,
        commandType,
        commandKey,
        payloadHash,
      );
      if (existing) return existing;
      throw new IdempotencyConflictError();
    }
    throw err;
  }
}

export type ReplaceEventSplitsInput = {
  householdId: string;
  financialEventId: string;
  sourceAmountMinor: bigint;
  splits: PersistSplit[];
  /** Test-only failure injection. */
  failPoint?: PersistFailPoint;
  executor?: DbExecutor;
};

/**
 * Replace category/principal splits for an event inside one transaction.
 * Invalid split sets throw before commit; original rows remain.
 */
export async function replaceEventSplits(input: ReplaceEventSplitsInput) {
  const run = async (db: DbExecutor) => {
    const [event] = await db
      .select()
      .from(financialEvents)
      .where(
        and(
          eq(financialEvents.id, input.financialEventId),
          eq(financialEvents.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!event) {
      throw new FinancialCommandFailedError("Financial event not found");
    }

    const total = input.splits.reduce((acc, s) => acc + s.amountMinor, 0n);
    if (total !== input.sourceAmountMinor) {
      throw new FinancialCommandFailedError(
        "Split total must equal source amount",
      );
    }
    for (const split of input.splits) {
      if (split.amountMinor <= 0n) {
        throw new FinancialCommandFailedError(
          "Split amountMinor must be positive",
        );
      }
    }

    await db
      .delete(transactionSplits)
      .where(eq(transactionSplits.financialEventId, input.financialEventId));

    for (let i = 0; i < input.splits.length; i++) {
      if (input.failPoint === "after_first_split" && i === 1) {
        throw new FinancialCommandFailedError(
          "Injected failure after first replacement split",
        );
      }
      const split = input.splits[i]!;
      await db.insert(transactionSplits).values({
        householdId: input.householdId,
        financialEventId: input.financialEventId,
        categoryId: split.categoryId,
        amountMinor: split.amountMinor,
        currency: "SEK",
        memo: split.memo,
        vehicleId: event.vehicleId ?? undefined,
      });
    }

    await db.insert(auditLogs).values({
      householdId: input.householdId,
      action: "ledger.replace_splits",
      entity: "financial_event",
      entityId: input.financialEventId,
      before: null,
      after: { splitCount: input.splits.length },
      source: "api",
    });

    return event;
  };

  if (input.executor) return run(input.executor);
  return getDb().transaction(async (tx) => run(tx));
}

export type ReviseEventDraftInput = {
  householdId: string;
  financialEventId: string;
  draft: BalancedLedgerDraft;
  occurredOn: string;
  description: string;
  incomeAmountMinor?: bigint;
  isInternalTransfer?: boolean;
  /** Test-only failure injection. */
  failPoint?: PersistFailPoint;
  executor?: DbExecutor;
};

/**
 * Atomically replace an event's economic meaning (type + amounts + postings).
 * Old postings/entry are removed and rebuilt in the same transaction.
 */
export async function reviseEventEconomicMeaning(input: ReviseEventDraftInput) {
  const run = async (db: DbExecutor) => {
    const [event] = await db
      .select()
      .from(financialEvents)
      .where(
        and(
          eq(financialEvents.id, input.financialEventId),
          eq(financialEvents.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!event) {
      throw new FinancialCommandFailedError("Financial event not found");
    }

    const entries = await db
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.financialEventId, input.financialEventId));
    const entryIds = entries.map((e) => e.id);

    if (entryIds.length) {
      await db
        .delete(ledgerPostings)
        .where(inArray(ledgerPostings.ledgerEntryId, entryIds));
      await db
        .delete(ledgerEntries)
        .where(eq(ledgerEntries.financialEventId, input.financialEventId));
    }

    if (input.failPoint === "after_event") {
      throw new FinancialCommandFailedError(
        "Injected failure after clearing old ledger rows",
      );
    }

    const [updated] = await db
      .update(financialEvents)
      .set({
        eventType: input.draft.eventType,
        occurredOn: input.occurredOn,
        description: input.description,
        expenseAmountMinor: input.draft.expenseAmountMinor,
        incomeAmountMinor: input.incomeAmountMinor ?? 0n,
        debtReductionMinor: input.draft.debtReductionMinor,
        netWorthDeltaMinor: input.draft.netWorthDeltaMinor,
        updatedAt: new Date(),
      })
      .where(eq(financialEvents.id, input.financialEventId))
      .returning();

    const [entry] = await db
      .insert(ledgerEntries)
      .values({
        householdId: input.householdId,
        financialEventId: input.financialEventId,
        bookedOn: input.occurredOn,
        currency: "SEK",
        memo: input.description,
      })
      .returning();

    if (input.failPoint === "after_entry") {
      throw new FinancialCommandFailedError(
        "Injected failure after revised ledger entry",
      );
    }

    const postings = input.draft.postings;
    for (let i = 0; i < postings.length; i++) {
      if (
        input.failPoint === "before_final_posting" &&
        i === postings.length - 1
      ) {
        throw new FinancialCommandFailedError(
          "Injected failure before final revised posting",
        );
      }
      const posting = postings[i]!;
      await db.insert(ledgerPostings).values({
        householdId: input.householdId,
        ledgerEntryId: entry.id,
        accountId: posting.accountId,
        side: posting.side,
        amountMinor: posting.amountMinor,
        currency: posting.currency,
        memo: posting.memo,
      });
    }

    if (input.isInternalTransfer !== undefined) {
      const links = await db
        .select({ sourceTransactionId: sourceTransactionLinks.sourceTransactionId })
        .from(sourceTransactionLinks)
        .where(
          eq(sourceTransactionLinks.financialEventId, input.financialEventId),
        );
      for (const link of links) {
        await db
          .update(sourceTransactions)
          .set({
            isInternalTransfer: input.isInternalTransfer,
            updatedAt: new Date(),
          })
          .where(eq(sourceTransactions.id, link.sourceTransactionId));
      }
    }

    await db.insert(auditLogs).values({
      householdId: input.householdId,
      action: "ledger.revise_classification",
      entity: "financial_event",
      entityId: input.financialEventId,
      before: {
        eventType: event.eventType,
        expenseAmountMinor: event.expenseAmountMinor.toString(),
      },
      after: {
        eventType: updated.eventType,
        expenseAmountMinor: updated.expenseAmountMinor.toString(),
      },
      source: "api",
    });

    return updated;
  };

  if (input.executor) return run(input.executor);
  return getDb().transaction(async (tx) => run(tx));
}

export type { Db, DbExecutor };
