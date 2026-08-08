import assert from "node:assert/strict";
import { test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { buildInternalTransfer } from "@ffos/financial-engine";
import { AuditService } from "../audit/audit.service";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import {
  accounts,
  financialCommandIdempotency,
  financialEvents,
  ledgerEntries,
  ledgerPostings,
  sourceTransactionLinks,
  sourceTransactions,
  transactionSplits,
} from "../db/schema-economic";
import { EconomicEventsService } from "./economic-events.service";
import { LedgerTruthService } from "./ledger-truth.service";
import { stubMerchantsService } from "../merchants/merchants.service.stub";

const AS_OF = "2026-08-01";

async function setupHousehold(label: string) {
  if (!process.env.DATABASE_URL) return null;
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name: `${label} ${Date.now()}`, baseCurrency: "SEK" })
    .returning();

  const mk = async (values: typeof accounts.$inferInsert) => {
    const [row] = await db.insert(accounts).values(values).returning();
    return row;
  };

  const bankA = await mk({
    householdId: household.id,
    name: "R1 Bank A",
    accountType: "CHECKING",
    openingBalanceMinor: 100_000_00n,
    currentBalanceMinor: 100_000_00n,
    isShared: true,
  });
  const bankB = await mk({
    householdId: household.id,
    name: "R1 Bank B",
    accountType: "SAVINGS",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
  });
  const creditCard = await mk({
    householdId: household.id,
    name: "R1 CC",
    accountType: "CREDIT_CARD",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
  });
  const expense = await mk({
    householdId: household.id,
    name: "R1 Expense",
    accountType: "EXPENSE",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
    isSystem: true,
  });
  const vehicle = await mk({
    householdId: household.id,
    name: "R1 Vehicle",
    accountType: "ASSET",
    openingBalanceMinor: 300_000_00n,
    currentBalanceMinor: 300_000_00n,
    isShared: true,
  });
  const mortgage = await mk({
    householdId: household.id,
    name: "R1 Mortgage",
    accountType: "MORTGAGE",
    // Positive is owed, per the canonical convention in `account-sign.ts`.
    openingBalanceMinor: 2_000_000_00n,
    currentBalanceMinor: 2_000_000_00n,
    isShared: true,
  });

  const audit = new AuditService();
  const ledger = new LedgerTruthService(audit);
  const events = new EconomicEventsService(ledger, audit, stubMerchantsService());
  return {
    db,
    household,
    bankA,
    bankB,
    creditCard,
    expense,
    vehicle,
    mortgage,
    ledger,
    events,
  };
}

async function countEvents(householdId: string) {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(financialEvents)
    .where(eq(financialEvents.householdId, householdId));
  return Number(row?.n ?? 0);
}

async function countPostings(householdId: string) {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, householdId));
  return Number(row?.n ?? 0);
}

test("R1-T1 Partial ledger rollback — mid-command failure leaves no residual rows", async () => {
  const ctx = await setupHousehold("R1-T1");
  if (!ctx) return;

  const beforeEvents = await countEvents(ctx.household.id);
  const beforePostings = await countPostings(ctx.household.id);
  const beforeBal = await ctx.ledger.reconstructHousehold(ctx.household.id);

  await assert.rejects(
    () =>
      ctx.events.createInternalTransfer({
        householdId: ctx.household.id,
        fromAccountId: ctx.bankA.id,
        toAccountId: ctx.bankB.id,
        amountMinor: 10_000_00n,
        occurredOn: AS_OF,
        externalId: `r1-t1-${ctx.household.id}`,
        failPoint: "before_final_posting",
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      return true;
    },
  );

  assert.equal(await countEvents(ctx.household.id), beforeEvents);
  assert.equal(await countPostings(ctx.household.id), beforePostings);

  const entries = await ctx.db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.householdId, ctx.household.id));
  assert.equal(entries.length, 0);

  const links = await ctx.db
    .select()
    .from(sourceTransactionLinks)
    .where(eq(sourceTransactionLinks.householdId, ctx.household.id));
  assert.equal(links.length, 0);

  const txs = await ctx.db
    .select()
    .from(sourceTransactions)
    .where(eq(sourceTransactions.householdId, ctx.household.id));
  assert.equal(txs.length, 0);

  const afterBal = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(afterBal.get(ctx.bankA.id), beforeBal.get(ctx.bankA.id));
  assert.equal(afterBal.get(ctx.bankB.id), beforeBal.get(ctx.bankB.id));
});

test("R1-T2 Depreciation retry — same externalId applies once", async () => {
  const ctx = await setupHousehold("R1-T2");
  if (!ctx) return;

  const externalId = `r1-depr-${ctx.household.id}`;
  const first = await ctx.events.createAssetDepreciation({
    householdId: ctx.household.id,
    assetAccountId: ctx.vehicle.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 20_000_00n,
    occurredOn: AS_OF,
    externalId,
  });
  const second = await ctx.events.createAssetDepreciation({
    householdId: ctx.household.id,
    assetAccountId: ctx.vehicle.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 20_000_00n,
    occurredOn: AS_OF,
    externalId,
  });

  assert.equal(first.id, second.id);
  assert.equal(await countEvents(ctx.household.id), 1);

  const bal = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(bal.get(ctx.vehicle.id), 280_000_00n);

  const idem = await ctx.db
    .select()
    .from(financialCommandIdempotency)
    .where(
      and(
        eq(financialCommandIdempotency.householdId, ctx.household.id),
        eq(financialCommandIdempotency.externalId, externalId),
      ),
    );
  assert.equal(idem.length, 1);

  const postings = await ctx.db
    .select()
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, ctx.household.id));
  assert.equal(postings.length, 2);
});

test("R1-T3 Depreciation idempotency conflict — same key different amount", async () => {
  const ctx = await setupHousehold("R1-T3");
  if (!ctx) return;

  const externalId = `r1-depr-conflict-${ctx.household.id}`;
  await ctx.events.createAssetDepreciation({
    householdId: ctx.household.id,
    assetAccountId: ctx.vehicle.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 20_000_00n,
    occurredOn: AS_OF,
    externalId,
  });

  await assert.rejects(
    () =>
      ctx.events.createAssetDepreciation({
        householdId: ctx.household.id,
        assetAccountId: ctx.vehicle.id,
        expenseAccountId: ctx.expense.id,
        amountMinor: 30_000_00n,
        occurredOn: AS_OF,
        externalId,
      }),
    (err: unknown) => {
      const withResponse = err as { getResponse?: () => unknown; getStatus?: () => number };
      assert.equal(withResponse.getStatus?.(), 409);
      const body = withResponse.getResponse?.();
      assert.ok(body && typeof body === "object");
      assert.equal((body as { code?: string }).code, "IDEMPOTENCY_CONFLICT");
      return true;
    },
  );

  assert.equal(await countEvents(ctx.household.id), 1);
  const bal = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(bal.get(ctx.vehicle.id), 280_000_00n);
});

test("R1-T4 Concurrent duplicate — one economic effect", async () => {
  const ctx = await setupHousehold("R1-T4");
  if (!ctx) return;

  const externalId = `r1-concurrent-${ctx.household.id}`;
  const args = {
    householdId: ctx.household.id,
    assetAccountId: ctx.vehicle.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 10_000_00n,
    occurredOn: AS_OF,
    externalId,
  } as const;

  const results = await Promise.all([
    ctx.events.createAssetDepreciation(args),
    ctx.events.createAssetDepreciation(args),
    ctx.events.createAssetDepreciation(args),
  ]);

  const ids = new Set(results.map((r) => r.id));
  assert.equal(ids.size, 1);
  assert.equal(await countEvents(ctx.household.id), 1);

  const bal = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(bal.get(ctx.vehicle.id), 290_000_00n);
});

test("R1-T5 Split rebuild rollback — invalid second split preserves original", async () => {
  const ctx = await setupHousehold("R1-T5");
  if (!ctx) return;

  const event = await ctx.events.createMortgagePayment({
    householdId: ctx.household.id,
    cashAccountId: ctx.bankA.id,
    mortgageAccountId: ctx.mortgage.id,
    interestExpenseAccountId: ctx.expense.id,
    principalMinor: 10_000_00n,
    interestMinor: 8_000_00n,
    occurredOn: AS_OF,
    externalId: `r1-mort-${ctx.household.id}`,
  });

  const originalSplits = await ctx.db
    .select()
    .from(transactionSplits)
    .where(eq(transactionSplits.financialEventId, event.id));
  assert.equal(originalSplits.length, 2);

  await assert.rejects(
    () =>
      ctx.events.replaceSplits({
        householdId: ctx.household.id,
        financialEventId: event.id,
        sourceAmountMinor: 18_000_00n,
        occurredOn: AS_OF,
        splits: [
          { amountMinor: 10_000_00n, memo: "principal" },
          { amountMinor: -1n, memo: "bad" },
        ],
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      return true;
    },
  );

  const afterInvalid = await ctx.db
    .select()
    .from(transactionSplits)
    .where(eq(transactionSplits.financialEventId, event.id));
  assert.equal(afterInvalid.length, 2);
  assert.ok(
    afterInvalid.some((s) => s.memo === "principal" && s.amountMinor === 10_000_00n),
  );
  assert.ok(
    afterInvalid.some((s) => s.memo === "interest" && s.amountMinor === 8_000_00n),
  );

  await assert.rejects(
    () =>
      ctx.events.replaceSplits({
        householdId: ctx.household.id,
        financialEventId: event.id,
        sourceAmountMinor: 18_000_00n,
        occurredOn: AS_OF,
        splits: [
          { amountMinor: 9_000_00n, memo: "principal" },
          { amountMinor: 9_000_00n, memo: "interest" },
        ],
        failPoint: "after_first_split",
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      return true;
    },
  );

  const afterFail = await ctx.db
    .select()
    .from(transactionSplits)
    .where(eq(transactionSplits.financialEventId, event.id));
  assert.equal(afterFail.length, 2);
  assert.ok(
    afterFail.some((s) => s.memo === "interest" && s.amountMinor === 8_000_00n),
  );
});

test("R1-T6 Classification revision rollback — old postings remain on failure", async () => {
  const ctx = await setupHousehold("R1-T6");
  if (!ctx) return;

  const expenseEvent = await ctx.events.createCashExpense({
    householdId: ctx.household.id,
    cashAccountId: ctx.bankA.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 1_500_00n,
    occurredOn: AS_OF,
    externalId: `r1-exp-${ctx.household.id}`,
  });

  const beforePostings = await ctx.db
    .select()
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, ctx.household.id));
  assert.equal(beforePostings.length, 2);
  assert.equal(expenseEvent.expenseAmountMinor, 1_500_00n);

  const transferDraft = buildInternalTransfer({
    fromAccountId: ctx.bankA.id,
    toAccountId: ctx.bankB.id,
    amountMinor: 1_500_00n,
    currency: "SEK",
  });

  await assert.rejects(
    () =>
      ctx.events.reviseClassification({
        householdId: ctx.household.id,
        financialEventId: expenseEvent.id,
        draft: transferDraft,
        occurredOn: AS_OF,
        description: "Reclassified transfer",
        isInternalTransfer: true,
        failPoint: "before_final_posting",
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      return true;
    },
  );

  const [event] = await ctx.db
    .select()
    .from(financialEvents)
    .where(eq(financialEvents.id, expenseEvent.id))
    .limit(1);
  assert.equal(event.eventType, "EXPENSE");
  assert.equal(event.expenseAmountMinor, 1_500_00n);

  const afterPostings = await ctx.db
    .select()
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, ctx.household.id));
  assert.equal(afterPostings.length, 2);

  const bal = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(bal.get(ctx.bankA.id), 98_500_00n);
  assert.equal(bal.get(ctx.bankB.id), 0n);

  // Successful atomic revision
  const revised = await ctx.events.reviseClassification({
    householdId: ctx.household.id,
    financialEventId: expenseEvent.id,
    draft: transferDraft,
    occurredOn: AS_OF,
    description: "Reclassified transfer",
    isInternalTransfer: true,
  });
  assert.equal(revised.eventType, "TRANSFER");
  assert.equal(revised.expenseAmountMinor, 0n);

  const finalBal = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(finalBal.get(ctx.bankA.id), 98_500_00n);
  assert.equal(finalBal.get(ctx.bankB.id), 1_500_00n);
});

test("R1 — credit-card payment idempotent retry", async () => {
  const ctx = await setupHousehold("R1-CC");
  if (!ctx) return;

  await ctx.events.createCreditCardPurchase({
    householdId: ctx.household.id,
    creditCardAccountId: ctx.creditCard.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 2_000_00n,
    occurredOn: AS_OF,
    externalId: `r1-cc-buy-${ctx.household.id}`,
  });

  const externalId = `r1-cc-pay-${ctx.household.id}`;
  const first = await ctx.events.createCreditCardPayment({
    householdId: ctx.household.id,
    cashAccountId: ctx.bankA.id,
    creditCardAccountId: ctx.creditCard.id,
    amountMinor: 2_000_00n,
    occurredOn: AS_OF,
    externalId,
  });
  const second = await ctx.events.createCreditCardPayment({
    householdId: ctx.household.id,
    cashAccountId: ctx.bankA.id,
    creditCardAccountId: ctx.creditCard.id,
    amountMinor: 2_000_00n,
    occurredOn: AS_OF,
    externalId,
  });
  assert.equal(first.id, second.id);

  const bal = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(bal.get(ctx.bankA.id), 98_000_00n);
  assert.equal(bal.get(ctx.creditCard.id), 0n);
});

test("R1 — persist path uses db.transaction", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const src = await fs.readFile(
    path.join(process.cwd(), "src/db/seed/persist-event.ts"),
    "utf8",
  );
  assert.equal(/\.transaction\s*\(/.test(src), true);
});
