import type { BalancedLedgerDraft } from "@ffos/financial-engine";
import { getDb } from "../client";
import {
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

export async function persistBalancedEvent(input: {
  householdId: string;
  draft: BalancedLedgerDraft;
  occurredOn: string;
  description: string;
  incomeAmountMinor?: bigint;
  categoryId?: string;
  merchantId?: string;
  sourceAccountId?: string;
  sourceAmountMinor?: bigint;
  isInternalTransfer?: boolean;
  transferGroupId?: string;
  importBatchId?: string;
  externalId?: string;
  /** Destination bank leg for internal transfers. */
  counterpartTx?: PersistCounterpartTx;
  splits?: PersistSplit[];
  createReconciliationGroup?: boolean;
}) {
  const db = getDb();
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
      sourceType: "seed",
      importBatchId: input.importBatchId,
      userVerified: true,
      confidence: "1",
    })
    .returning();

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

  for (const posting of input.draft.postings) {
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
        externalId: input.externalId ?? `seed-${event.id}`,
        fingerprint: `fp-${event.id}`,
        bookingDate: input.occurredOn,
        valueDate: input.occurredOn,
        amountMinor: input.sourceAmountMinor,
        currency: "SEK",
        description: input.description,
        rawDescription: input.description,
        merchantId: input.merchantId,
        categoryId: input.categoryId,
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
          input.counterpartTx.externalId ?? `seed-${event.id}-counterpart`,
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
    for (const split of input.splits) {
      await db.insert(transactionSplits).values({
        householdId: input.householdId,
        financialEventId: event.id,
        categoryId: split.categoryId,
        amountMinor: split.amountMinor,
        currency: "SEK",
        memo: split.memo,
      });
    }
  }

  return event;
}
