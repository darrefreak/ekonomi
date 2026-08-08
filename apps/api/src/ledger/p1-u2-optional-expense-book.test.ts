import assert from "node:assert/strict";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { accounts, financialEvents } from "../db/schema-economic";
import { EconomicEventsService } from "./economic-events.service";
import { LedgerTruthService } from "./ledger-truth.service";
import { stubMerchantsService } from "../merchants/merchants.service.stub";

const AS_OF = "2026-08-01";

/**
 * P1-U2: credit-card purchases and mortgage payments should not require the
 * caller to know the household's hidden system EXPENSE account id — the
 * frontend forms only collect cc/mortgage account + amount, so the service
 * must resolve (and create on first use) the system book automatically.
 */
async function setup() {
  if (!process.env.DATABASE_URL) return null;
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name: `P1-U2 Optional Expense ${Date.now()}`, baseCurrency: "SEK" })
    .returning();

  const mk = async (values: typeof accounts.$inferInsert) => {
    const [row] = await db.insert(accounts).values(values).returning();
    return row;
  };

  const cash = await mk({
    householdId: household.id,
    name: "Cash",
    accountType: "CHECKING",
    openingBalanceMinor: 500_000_00n,
    currentBalanceMinor: 500_000_00n,
    isShared: true,
  });
  const mortgage = await mk({
    householdId: household.id,
    name: "Mortgage",
    accountType: "MORTGAGE",
    openingBalanceMinor: 3_000_000_00n,
    currentBalanceMinor: 3_000_000_00n,
    isShared: true,
  });
  const creditCard = await mk({
    householdId: household.id,
    name: "CC",
    accountType: "CREDIT_CARD",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
  });

  const audit = new AuditService();
  const ledger = new LedgerTruthService(audit);
  const events = new EconomicEventsService(ledger, audit, stubMerchantsService());
  return { db, household, cash, mortgage, creditCard, events };
}

async function findSystemExpenseAccounts(db: ReturnType<typeof getDb>, householdId: string) {
  return db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.householdId, householdId),
        eq(accounts.accountType, "EXPENSE"),
        eq(accounts.isSystem, true),
      ),
    );
}

test("credit-card purchase without expenseAccountId resolves system EXPENSE book once", async () => {
  const ctx = await setup();
  if (!ctx) return;

  const first = await ctx.events.createCreditCardPurchase({
    householdId: ctx.household.id,
    creditCardAccountId: ctx.creditCard.id,
    amountMinor: 1_500_00n,
    occurredOn: AS_OF,
    externalId: `p1u2-cc-buy-${ctx.household.id}`,
  });
  assert.equal(first.status, "ACTIVE");

  const second = await ctx.events.createCreditCardPurchase({
    householdId: ctx.household.id,
    creditCardAccountId: ctx.creditCard.id,
    amountMinor: 500_00n,
    occurredOn: AS_OF,
    externalId: `p1u2-cc-buy-2-${ctx.household.id}`,
  });
  assert.equal(second.status, "ACTIVE");

  const expenseAccounts = await findSystemExpenseAccounts(ctx.db, ctx.household.id);
  assert.equal(
    expenseAccounts.length,
    1,
    "resolution should reuse the same system EXPENSE book, not create duplicates",
  );
});

test("mortgage payment without interestExpenseAccountId resolves system EXPENSE book", async () => {
  const ctx = await setup();
  if (!ctx) return;

  const event = await ctx.events.createMortgagePayment({
    householdId: ctx.household.id,
    cashAccountId: ctx.cash.id,
    mortgageAccountId: ctx.mortgage.id,
    principalMinor: 10_000_00n,
    interestMinor: 8_000_00n,
    occurredOn: AS_OF,
    externalId: `p1u2-mortgage-${ctx.household.id}`,
  });
  assert.equal(event.status, "ACTIVE");

  const expenseAccounts = await findSystemExpenseAccounts(ctx.db, ctx.household.id);
  assert.equal(expenseAccounts.length, 1, "system EXPENSE book should be created on first use");

  const financialEvent = await ctx.db
    .select()
    .from(financialEvents)
    .where(eq(financialEvents.id, event.id));
  assert.equal(financialEvent.length, 1);
});
