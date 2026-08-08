import assert from "node:assert/strict";
import { test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { money } from "@ffos/domain";
import { calculateNetWorth } from "@ffos/financial-engine";
import { AuditService } from "../audit/audit.service";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import {
  accountBalanceSnapshots,
  accounts,
  financialEvents,
  transactionSplits,
} from "../db/schema-economic";
import { EconomicEventsService } from "./economic-events.service";
import { LedgerTruthService } from "./ledger-truth.service";
import { stubMerchantsService } from "../merchants/merchants.service.stub";

const AS_OF = "2026-08-01";

async function setup() {
  if (!process.env.DATABASE_URL) return null;
  const db = getDb();

  // Isolated household so parallel suite tests cannot race the demo household.
  const [household] = await db
    .insert(households)
    .values({
      name: `A2 Invariants ${Date.now()}`,
      baseCurrency: "SEK",
    })
    .returning();

  const audit = new AuditService();
  const ledger = new LedgerTruthService(audit);
  const events = new EconomicEventsService(ledger, audit, stubMerchantsService());

  const suffix = `${Date.now()}`;
  const mk = async (values: typeof accounts.$inferInsert) => {
    const [row] = await db.insert(accounts).values(values).returning();
    return row;
  };

  const bankA = await mk({
    householdId: household.id,
    name: `A2 Bank A ${suffix}`,
    accountType: "CHECKING",
    openingBalanceMinor: 100_000_00n,
    currentBalanceMinor: 100_000_00n,
    reportedBalanceMinor: 100_000_00n,
    isShared: true,
    isSystem: false,
  });
  const bankB = await mk({
    householdId: household.id,
    name: `A2 Bank B ${suffix}`,
    accountType: "CHECKING",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    reportedBalanceMinor: 0n,
    isShared: true,
    isSystem: false,
  });
  const creditCard = await mk({
    householdId: household.id,
    name: `A2 CC ${suffix}`,
    accountType: "CREDIT_CARD",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    reportedBalanceMinor: 0n,
    isShared: true,
    isSystem: false,
  });
  const mortgage = await mk({
    householdId: household.id,
    name: `A2 Mortgage ${suffix}`,
    accountType: "MORTGAGE",
    openingBalanceMinor: 500_000_00n,
    currentBalanceMinor: 500_000_00n,
    reportedBalanceMinor: 500_000_00n,
    isShared: true,
    isSystem: false,
  });
  const investment = await mk({
    householdId: household.id,
    name: `A2 Invest ${suffix}`,
    accountType: "INVESTMENT",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    reportedBalanceMinor: 0n,
    isShared: true,
    isSystem: false,
  });
  const expense = await mk({
    householdId: household.id,
    name: `A2 Expense ${suffix}`,
    accountType: "EXPENSE",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
    isSystem: true,
  });

  return {
    db,
    household,
    ledger,
    events,
    bankA,
    bankB,
    creditCard,
    mortgage,
    investment,
    expense,
  };
}

function position(
  balances: Map<string, bigint>,
  rows: Array<{ id: string; accountType: string }>,
) {
  const sumType = (...types: string[]) =>
    rows
      .filter((a) => types.includes(a.accountType))
      .reduce((acc, a) => {
        const bal = balances.get(a.id) ?? 0n;
        if (types.some((t) => ["MORTGAGE", "LOAN", "CREDIT_CARD"].includes(t))) {
          return acc + (bal < 0n ? -bal : bal);
        }
        return acc + bal;
      }, 0n);

  return calculateNetWorth({
    cash: money(sumType("CHECKING", "SAVINGS", "CASH"), "SEK"),
    investments: money(sumType("INVESTMENT", "PENSION", "CRYPTO"), "SEK"),
    assets: money(sumType("ASSET"), "SEK"),
    liabilities: money(sumType("MORTGAGE", "LOAN", "CREDIT_CARD"), "SEK"),
  });
}

test("A2 Test 1 — internal transfer persisted invariants", async () => {
  const ctx = await setup();
  if (!ctx) return;

  const before = await ctx.ledger.reconstructHousehold(ctx.household.id);
  const beforeNw = position(before, [ctx.bankA, ctx.bankB]);

  const event = await ctx.events.createInternalTransfer({
    householdId: ctx.household.id,
    fromAccountId: ctx.bankA.id,
    toAccountId: ctx.bankB.id,
    amountMinor: 20_000_00n,
    occurredOn: AS_OF,
    description: "A2 internal transfer",
    externalId: `a2-transfer-${ctx.bankA.id}`,
  });

  assert.equal(event.expenseAmountMinor, 0n);
  assert.equal(event.netWorthDeltaMinor, 0n);

  const after = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(after.get(ctx.bankA.id), 80_000_00n);
  assert.equal(after.get(ctx.bankB.id), 20_000_00n);

  const afterNw = position(after, [ctx.bankA, ctx.bankB]);
  assert.equal(afterNw.amountMinor, beforeNw.amountMinor);
});

test("A2 Test 2 — credit card purchase + payment", async () => {
  const ctx = await setup();
  if (!ctx) return;

  const purchase = await ctx.events.createCreditCardPurchase({
    householdId: ctx.household.id,
    creditCardAccountId: ctx.creditCard.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 2_000_00n,
    occurredOn: AS_OF,
    description: "ICA",
  });
  assert.equal(purchase.expenseAmountMinor, 2_000_00n);

  const mid = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(mid.get(ctx.creditCard.id), 2_000_00n);

  const payment = await ctx.events.createCreditCardPayment({
    householdId: ctx.household.id,
    cashAccountId: ctx.bankA.id,
    creditCardAccountId: ctx.creditCard.id,
    amountMinor: 2_000_00n,
    occurredOn: AS_OF,
    description: "CC payment",
  });
  assert.equal(payment.expenseAmountMinor, 0n);

  const end = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(end.get(ctx.creditCard.id), 0n);
  assert.equal(end.get(ctx.bankA.id), 98_000_00n);

  const [expenseSum] = await ctx.db
    .select({
      total: sql<string>`coalesce(sum(${financialEvents.expenseAmountMinor}), 0)`,
    })
    .from(financialEvents)
    .where(
      and(
        eq(financialEvents.householdId, ctx.household.id),
        eq(financialEvents.id, purchase.id),
      ),
    );
  assert.equal(BigInt(expenseSum.total), 2_000_00n);
  assert.equal(payment.expenseAmountMinor, 0n);
});

test("A2 Test 3 — mortgage principal/interest split", async () => {
  const ctx = await setup();
  if (!ctx) return;

  const before = await ctx.ledger.reconstructHousehold(ctx.household.id);
  const beforeCash = before.get(ctx.bankA.id) ?? 0n;
  const beforeDebt = before.get(ctx.mortgage.id) ?? 0n;
  const beforeNw = position(before, [ctx.bankA, ctx.mortgage]);

  const event = await ctx.events.createMortgagePayment({
    householdId: ctx.household.id,
    cashAccountId: ctx.bankA.id,
    mortgageAccountId: ctx.mortgage.id,
    interestExpenseAccountId: ctx.expense.id,
    principalMinor: 10_000_00n,
    interestMinor: 8_000_00n,
    occurredOn: AS_OF,
  });

  assert.equal(event.expenseAmountMinor, 8_000_00n);
  assert.equal(event.debtReductionMinor, 10_000_00n);
  assert.equal(event.netWorthDeltaMinor, -8_000_00n);

  const splits = await ctx.db
    .select()
    .from(transactionSplits)
    .where(eq(transactionSplits.financialEventId, event.id));
  assert.equal(splits.length, 2);
  assert.ok(splits.some((s) => s.memo === "principal" && s.amountMinor === 10_000_00n));
  assert.ok(splits.some((s) => s.memo === "interest" && s.amountMinor === 8_000_00n));

  const after = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(after.get(ctx.bankA.id), beforeCash - 18_000_00n);
  assert.equal(after.get(ctx.mortgage.id), beforeDebt - 10_000_00n);

  const afterNw = position(after, [ctx.bankA, ctx.mortgage]);
  assert.equal(afterNw.amountMinor, beforeNw.amountMinor - 8_000_00n);
});

test("A2 Test 4 — investment transfer", async () => {
  const ctx = await setup();
  if (!ctx) return;

  const before = await ctx.ledger.reconstructHousehold(ctx.household.id);
  const beforeNw = position(before, [ctx.bankA, ctx.investment]);

  const event = await ctx.events.createInvestmentTransfer({
    householdId: ctx.household.id,
    cashAccountId: ctx.bankA.id,
    investmentAccountId: ctx.investment.id,
    amountMinor: 20_000_00n,
    occurredOn: AS_OF,
  });
  assert.equal(event.expenseAmountMinor, 0n);
  assert.equal(event.netWorthDeltaMinor, 0n);

  const after = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(after.get(ctx.bankA.id), 80_000_00n);
  assert.equal(after.get(ctx.investment.id), 20_000_00n);

  const afterNw = position(after, [ctx.bankA, ctx.investment]);
  assert.equal(afterNw.amountMinor, beforeNw.amountMinor);
});

test("A2 Test 5 — reconciliation mismatch visible, no silent overwrite", async () => {
  const ctx = await setup();
  if (!ctx) return;

  await ctx.db
    .update(accounts)
    .set({ reportedBalanceMinor: 128_850_00n })
    .where(eq(accounts.id, ctx.bankA.id));

  const result = await ctx.ledger.reconcileHousehold(ctx.household.id, AS_OF);
  const row = result.results.find((r) => r.accountId === ctx.bankA.id);
  assert.ok(row);
  assert.equal(row.status, "MISMATCH");
  assert.equal(row.differenceMinor, (128_850_00n - 100_000_00n).toString());

  const [acct] = await ctx.db
    .select()
    .from(accounts)
    .where(eq(accounts.id, ctx.bankA.id))
    .limit(1);
  assert.equal(acct.currentBalanceMinor, 100_000_00n);
  assert.equal(acct.reportedBalanceMinor, 128_850_00n);
  assert.notEqual(acct.reportedBalanceMinor, acct.currentBalanceMinor);
});

test("A2 Test 6 — reconcile retry idempotent; transfer externalId idempotent", async () => {
  const ctx = await setup();
  if (!ctx) return;

  const externalId = `a2-idem-${ctx.bankA.id}`;
  const first = await ctx.events.createInternalTransfer({
    householdId: ctx.household.id,
    fromAccountId: ctx.bankA.id,
    toAccountId: ctx.bankB.id,
    amountMinor: 5_000_00n,
    occurredOn: AS_OF,
    externalId,
  });
  const second = await ctx.events.createInternalTransfer({
    householdId: ctx.household.id,
    fromAccountId: ctx.bankA.id,
    toAccountId: ctx.bankB.id,
    amountMinor: 5_000_00n,
    occurredOn: AS_OF,
    externalId,
  });
  assert.equal(first.id, second.id);

  const balances = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(balances.get(ctx.bankA.id), 95_000_00n);
  assert.equal(balances.get(ctx.bankB.id), 5_000_00n);

  await ctx.ledger.reconcileHousehold(ctx.household.id, AS_OF);
  await ctx.ledger.reconcileHousehold(ctx.household.id, AS_OF);

  const snaps = await ctx.db
    .select()
    .from(accountBalanceSnapshots)
    .where(
      and(
        eq(accountBalanceSnapshots.householdId, ctx.household.id),
        eq(accountBalanceSnapshots.accountId, ctx.bankA.id),
        eq(accountBalanceSnapshots.source, "ledger_reconcile"),
      ),
    );
  assert.equal(snaps.length, 1);
});

test("A2 refund reduces expense rather than unrelated income", async () => {
  const ctx = await setup();
  if (!ctx) return;

  await ctx.events.createCreditCardPurchase({
    householdId: ctx.household.id,
    creditCardAccountId: ctx.creditCard.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 500_00n,
    occurredOn: AS_OF,
  });

  const refund = await ctx.events.createCashRefund({
    householdId: ctx.household.id,
    cashAccountId: ctx.bankA.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 200_00n,
    occurredOn: AS_OF,
  });
  assert.equal(refund.expenseAmountMinor, -200_00n);
  assert.equal(refund.incomeAmountMinor, 0n);
});
