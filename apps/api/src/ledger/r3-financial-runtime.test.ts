import assert from "node:assert/strict";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import { money } from "@ffos/domain";
import { calculateNetWorth } from "@ffos/financial-engine";
import { AuditService } from "../audit/audit.service";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import {
  accounts,
  financialEvents,
  sourceTransactions,
} from "../db/schema-economic";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { EconomicEventsService } from "./economic-events.service";
import { LedgerTruthService } from "./ledger-truth.service";
import { stubMerchantsService } from "../merchants/merchants.service.stub";

const AS_OF = "2026-08-01";
const PERIOD_START = "2026-08-01";
const PERIOD_END = "2026-08-31";

async function setup() {
  if (!process.env.DATABASE_URL) return null;
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name: `R3 Runtime ${Date.now()}`, baseCurrency: "SEK" })
    .returning();

  const mk = async (values: typeof accounts.$inferInsert) => {
    const [row] = await db.insert(accounts).values(values).returning();
    return row;
  };

  const cash = await mk({
    householdId: household.id,
    name: "R3 Cash",
    accountType: "CHECKING",
    openingBalanceMinor: 500_000_00n,
    currentBalanceMinor: 500_000_00n,
    isShared: true,
  });
  const savings = await mk({
    householdId: household.id,
    name: "R3 Savings",
    accountType: "SAVINGS",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
  });
  const mortgage = await mk({
    householdId: household.id,
    name: "R3 Mortgage",
    accountType: "MORTGAGE",
    openingBalanceMinor: 3_000_000_00n,
    currentBalanceMinor: 3_000_000_00n,
    interestRateBps: 300,
    isShared: true,
  });
  const creditCard = await mk({
    householdId: household.id,
    name: "R3 CC",
    accountType: "CREDIT_CARD",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
  });
  const investment = await mk({
    householdId: household.id,
    name: "R3 Invest",
    accountType: "INVESTMENT",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
  });
  const vehicle = await mk({
    householdId: household.id,
    name: "R3 Vehicle",
    accountType: "ASSET",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
  });
  const expense = await mk({
    householdId: household.id,
    name: "R3 Expense",
    accountType: "EXPENSE",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
    isSystem: true,
  });
  const income = await mk({
    householdId: household.id,
    name: "R3 Income",
    accountType: "INCOME",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
    isSystem: true,
  });
  const loan = await mk({
    householdId: household.id,
    name: "R3 Auto Loan",
    accountType: "LOAN",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
  });

  const audit = new AuditService();
  const ledger = new LedgerTruthService(audit);
  const events = new EconomicEventsService(ledger, audit, stubMerchantsService());
  const metrics = new HouseholdMetricsService();
  return {
    db,
    household,
    cash,
    savings,
    mortgage,
    creditCard,
    investment,
    vehicle,
    expense,
    income,
    loan,
    ledger,
    events,
    metrics,
  };
}

test("R3 comprehensive scenario — no double counting", async () => {
  const ctx = await setup();
  if (!ctx) return;

  // Opening purchase of vehicle (not period income).
  await ctx.events.createAssetPurchase({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    assetAccountId: ctx.vehicle.id,
    amountMinor: 300_000_00n,
    occurredOn: "2026-01-15",
    externalId: `r3-purchase-${ctx.household.id}`,
  });

  // Period economics
  const { buildIncome } = await import("@ffos/financial-engine");
  const salaryDraft = buildIncome({
    cashAccountId: ctx.cash.id,
    incomeAccountId: ctx.income.id,
    amountMinor: 50_000_00n,
    currency: "SEK",
  });
  await ctx.events.persistDraft({
    householdId: ctx.household.id,
    draft: salaryDraft,
    occurredOn: AS_OF,
    description: "Lön",
    sourceAccountId: ctx.cash.id,
    sourceAmountMinor: 50_000_00n,
    incomeAmountMinor: 50_000_00n,
    externalId: `r3-salary-${ctx.household.id}`,
    commandType: "LEDGER_EVENT",
  });

  await ctx.events.createCreditCardPurchase({
    householdId: ctx.household.id,
    creditCardAccountId: ctx.creditCard.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 2_000_00n,
    occurredOn: AS_OF,
    externalId: `r3-cc-buy-${ctx.household.id}`,
  });
  await ctx.events.createCreditCardPayment({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    creditCardAccountId: ctx.creditCard.id,
    amountMinor: 2_000_00n,
    occurredOn: AS_OF,
    externalId: `r3-cc-pay-${ctx.household.id}`,
  });
  await ctx.events.createMortgagePayment({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    mortgageAccountId: ctx.mortgage.id,
    interestExpenseAccountId: ctx.expense.id,
    principalMinor: 10_000_00n,
    interestMinor: 8_000_00n,
    occurredOn: AS_OF,
    externalId: `r3-mort-${ctx.household.id}`,
  });
  await ctx.events.createInvestmentTransfer({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    investmentAccountId: ctx.investment.id,
    amountMinor: 10_000_00n,
    occurredOn: AS_OF,
    externalId: `r3-invest-${ctx.household.id}`,
  });
  await ctx.events.createAssetDepreciation({
    householdId: ctx.household.id,
    assetAccountId: ctx.vehicle.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 20_000_00n,
    occurredOn: AS_OF,
    externalId: `r3-depr-${ctx.household.id}`,
  });
  await ctx.events.createCashRefund({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 500_00n,
    occurredOn: AS_OF,
    externalId: `r3-refund-${ctx.household.id}`,
  });

  const bal = await ctx.ledger.reconstructHousehold(ctx.household.id);
  // Cash: 500k − 300k purchase + 50k salary − 2k CC pay − 18k mort − 10k invest + 0.5k refund
  assert.equal(bal.get(ctx.cash.id), 220_500_00n);
  assert.equal(bal.get(ctx.creditCard.id), 0n);
  assert.equal(bal.get(ctx.mortgage.id), 2_990_000_00n);
  assert.equal(bal.get(ctx.investment.id), 10_000_00n);
  assert.equal(bal.get(ctx.vehicle.id), 280_000_00n);

  const period = await ctx.metrics.periodEventTotals(
    ctx.household.id,
    PERIOD_START,
    PERIOD_END,
  );
  // Income 50k; spending = groceries 2k + interest 8k − refund 0.5k = 9.5k
  assert.equal(period.incomeMinor, 50_000_00n);
  assert.equal(period.spendingMinor, 9_500_00n);
  assert.equal(period.debtReductionMinor, 10_000_00n);

  const nw = calculateNetWorth({
    cash: money(
      (bal.get(ctx.cash.id) ?? 0n) + (bal.get(ctx.savings.id) ?? 0n),
      "SEK",
    ),
    investments: money(bal.get(ctx.investment.id) ?? 0n, "SEK"),
    assets: money(bal.get(ctx.vehicle.id) ?? 0n, "SEK"),
    liabilities: money(
      (bal.get(ctx.mortgage.id) ?? 0n) + (bal.get(ctx.creditCard.id) ?? 0n),
      "SEK",
    ),
  });
  // 220500 + 10000 + 280000 − 2990000 = −2_479_500
  assert.equal(nw.amountMinor, -2_479_500_00n);
});

test("R3 classification revise EXPENSE→TRANSFER updates economics", async () => {
  const ctx = await setup();
  if (!ctx) return;

  const expenseEvent = await ctx.events.createCashExpense({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 2_000_00n,
    occurredOn: AS_OF,
    externalId: `r3-exp-${ctx.household.id}`,
  });
  let period = await ctx.metrics.periodEventTotals(
    ctx.household.id,
    PERIOD_START,
    PERIOD_END,
  );
  assert.equal(period.spendingMinor, 2_000_00n);

  await ctx.events.reviseExpenseToTransfer({
    householdId: ctx.household.id,
    financialEventId: expenseEvent.id,
    fromAccountId: ctx.cash.id,
    toAccountId: ctx.savings.id,
    amountMinor: 2_000_00n,
    occurredOn: AS_OF,
  });

  period = await ctx.metrics.periodEventTotals(
    ctx.household.id,
    PERIOD_START,
    PERIOD_END,
  );
  assert.equal(period.spendingMinor, 0n);

  const bal = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(bal.get(ctx.cash.id), 498_000_00n);
  assert.equal(bal.get(ctx.savings.id), 2_000_00n);

  const [row] = await ctx.db
    .select()
    .from(financialEvents)
    .where(eq(financialEvents.id, expenseEvent.id));
  assert.equal(row.eventType, "TRANSFER");
  assert.equal(row.expenseAmountMinor, 0n);
});

test("R3 exclude removes from period metrics; re-include restores once", async () => {
  const ctx = await setup();
  if (!ctx) return;

  const event = await ctx.events.createCashExpense({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 1_000_00n,
    occurredOn: AS_OF,
    externalId: `r3-ex-${ctx.household.id}`,
  });

  const [tx] = await ctx.db
    .select()
    .from(sourceTransactions)
    .where(
      and(
        eq(sourceTransactions.householdId, ctx.household.id),
        eq(sourceTransactions.externalId, `r3-ex-${ctx.household.id}`),
      ),
    )
    .limit(1);
  assert.ok(tx);

  await ctx.db
    .update(sourceTransactions)
    .set({ isExcluded: true })
    .where(eq(sourceTransactions.id, tx.id));

  let period = await ctx.metrics.periodEventTotals(
    ctx.household.id,
    PERIOD_START,
    PERIOD_END,
  );
  assert.equal(period.spendingMinor, 0n);

  // Ledger still reflects cash movement.
  const bal = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(bal.get(ctx.cash.id), 499_000_00n);

  await ctx.db
    .update(sourceTransactions)
    .set({ isExcluded: false })
    .where(eq(sourceTransactions.id, tx.id));
  period = await ctx.metrics.periodEventTotals(
    ctx.household.id,
    PERIOD_START,
    PERIOD_END,
  );
  assert.equal(period.spendingMinor, 1_000_00n);
  void event;
});

test("R3 reverse excludes from reconstruct and period totals", async () => {
  const ctx = await setup();
  if (!ctx) return;

  const event = await ctx.events.createCashExpense({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 3_000_00n,
    occurredOn: AS_OF,
    externalId: `r3-rev-${ctx.household.id}`,
  });
  assert.equal(
    (await ctx.ledger.reconstructHousehold(ctx.household.id)).get(ctx.cash.id),
    497_000_00n,
  );

  await ctx.events.reverseFinancialEvent({
    householdId: ctx.household.id,
    financialEventId: event.id,
  });

  const bal = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(bal.get(ctx.cash.id), 500_000_00n);

  const period = await ctx.metrics.periodEventTotals(
    ctx.household.id,
    PERIOD_START,
    PERIOD_END,
  );
  assert.equal(period.spendingMinor, 0n);

  const [row] = await ctx.db
    .select()
    .from(financialEvents)
    .where(eq(financialEvents.id, event.id));
  assert.equal(row.status, "REVERSED");
});

test("R3 depreciation incremental across valuations is consistent", async () => {
  const ctx = await setup();
  if (!ctx) return;

  await ctx.events.createAssetPurchase({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    assetAccountId: ctx.vehicle.id,
    amountMinor: 300_000_00n,
    occurredOn: "2024-01-01",
    externalId: `r3-v-purch-${ctx.household.id}`,
  });
  await ctx.events.createAssetDepreciation({
    householdId: ctx.household.id,
    assetAccountId: ctx.vehicle.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 20_000_00n,
    occurredOn: "2025-01-01",
    externalId: `r3-v-d1-${ctx.household.id}`,
  });
  await ctx.events.createAssetDepreciation({
    householdId: ctx.household.id,
    assetAccountId: ctx.vehicle.id,
    expenseAccountId: ctx.expense.id,
    amountMinor: 30_000_00n,
    occurredOn: "2026-01-01",
    externalId: `r3-v-d2-${ctx.household.id}`,
  });

  const bal = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(bal.get(ctx.vehicle.id), 250_000_00n);
  // Cumulative economic write-down = 50k (20k + 30k), not 20k + 50k.
});

test("R3 financed purchase runtime path", async () => {
  const ctx = await setup();
  if (!ctx) return;

  await ctx.events.createFinancedAssetPurchase({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    assetAccountId: ctx.vehicle.id,
    loanAccountId: ctx.loan.id,
    purchasePriceMinor: 300_000_00n,
    downPaymentMinor: 50_000_00n,
    occurredOn: AS_OF,
    externalId: `r3-fin-${ctx.household.id}`,
  });

  const bal = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(bal.get(ctx.vehicle.id), 300_000_00n);
  assert.equal(bal.get(ctx.cash.id), 450_000_00n);
  assert.equal(bal.get(ctx.loan.id), 250_000_00n);

  const period = await ctx.metrics.periodEventTotals(
    ctx.household.id,
    PERIOD_START,
    PERIOD_END,
  );
  assert.equal(period.spendingMinor, 0n);
  assert.equal(period.incomeMinor, 0n);
});

test("R3 opening balances are not period income/expense", async () => {
  const ctx = await setup();
  if (!ctx) return;

  const period = await ctx.metrics.periodEventTotals(
    ctx.household.id,
    PERIOD_START,
    PERIOD_END,
  );
  assert.equal(period.incomeMinor, 0n);
  assert.equal(period.spendingMinor, 0n);

  const bal = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(bal.get(ctx.cash.id), 500_000_00n);
  assert.equal(bal.get(ctx.mortgage.id), 3_000_000_00n);
});
