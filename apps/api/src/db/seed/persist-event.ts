import type { BalancedLedgerDraft } from "@ffos/financial-engine";
import { getDb } from "../client";
import {
  financialEvents,
  ledgerEntries,
  ledgerPostings,
  sourceTransactionLinks,
  sourceTransactions,
} from "../schema-economic";

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
        transferGroupId: input.transferGroupId,
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

  return event;
}
