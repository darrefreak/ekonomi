import assert from "node:assert/strict";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import { AccountsService } from "../accounts/accounts.service";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import {
  accountBalanceSnapshots,
  accounts,
} from "../db/schema-economic";
import type { HouseholdAccessService } from "../households/household-access.service";
import { DebtService } from "../debt/debt.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { EconomicEventsService } from "./economic-events.service";
import { LedgerTruthService } from "./ledger-truth.service";

const AS_OF = "2026-08-01";

async function setup() {
  if (!process.env.DATABASE_URL) return null;
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name: `R2 Truth ${Date.now()}`, baseCurrency: "SEK" })
    .returning();

  const mk = async (values: typeof accounts.$inferInsert) => {
    const [row] = await db.insert(accounts).values(values).returning();
    return row;
  };

  const bank = await mk({
    householdId: household.id,
    name: "R2 Bank",
    accountType: "CHECKING",
    openingBalanceMinor: 100_000_00n,
    currentBalanceMinor: 100_000_00n,
    isShared: true,
  });
  const bankB = await mk({
    householdId: household.id,
    name: "R2 Savings",
    accountType: "SAVINGS",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
  });
  const mortgage = await mk({
    householdId: household.id,
    name: "R2 Mortgage",
    accountType: "MORTGAGE",
    // Liability openings are stored positive (owed); debit principal reduces.
    openingBalanceMinor: 1_000_000_00n,
    currentBalanceMinor: 1_000_000_00n,
    interestRateBps: 350,
    isShared: true,
  });
  const expense = await mk({
    householdId: household.id,
    name: "R2 Expense",
    accountType: "EXPENSE",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
    isSystem: true,
  });

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
    requireCanWrite: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
    accountVisibility: async () => "full" as const,
    projectAccountListItem: <T>(item: T) => item,
    projectTransactionItem: <T>(item: T) => item,
  } as unknown as HouseholdAccessService;

  const audit = new AuditService();
  const ledger = new LedgerTruthService(audit);
  const events = new EconomicEventsService(ledger, audit);
  const metrics = new HouseholdMetricsService();
  const accountsService = new AccountsService(access, audit, ledger);
  const debt = new DebtService(access, metrics);

  return {
    db,
    household,
    bank,
    bankB,
    mortgage,
    expense,
    ledger,
    events,
    metrics,
    accountsService,
    debt,
  };
}

test("R2-A5 — accounts list uses ledger balance not stale cache", async () => {
  const ctx = await setup();
  if (!ctx) return;

  await ctx.events.createInternalTransfer({
    householdId: ctx.household.id,
    fromAccountId: ctx.bank.id,
    toAccountId: ctx.bankB.id,
    amountMinor: 25_000_00n,
    occurredOn: AS_OF,
    externalId: `r2-list-${ctx.household.id}`,
  });

  // Poison cache intentionally.
  await ctx.db
    .update(accounts)
    .set({ currentBalanceMinor: 999_999_00n })
    .where(eq(accounts.id, ctx.bank.id));

  const list = await ctx.accountsService.list("user-1", ctx.household.id);
  const item = list.items.find((i) => i.id === ctx.bank.id);
  assert.ok(item);
  assert.equal(item.currentBalance.amountMinor, "7500000");
});

test("R2-A5 — debt detail uses ledger-aligned outstanding", async () => {
  const ctx = await setup();
  if (!ctx) return;

  await ctx.events.createMortgagePayment({
    householdId: ctx.household.id,
    cashAccountId: ctx.bank.id,
    mortgageAccountId: ctx.mortgage.id,
    interestExpenseAccountId: ctx.expense.id,
    principalMinor: 10_000_00n,
    interestMinor: 5_000_00n,
    occurredOn: AS_OF,
    externalId: `r2-debt-${ctx.household.id}`,
  });

  await ctx.db
    .update(accounts)
    .set({ currentBalanceMinor: -50_00n })
    .where(eq(accounts.id, ctx.mortgage.id));

  const detail = await ctx.debt.detail(
    "user-1",
    ctx.household.id,
    ctx.mortgage.id,
  );
  // Opening -1_000_000 + principal reduction 10_000 → outstanding 990_000
  assert.equal(detail.item.outstanding.amountMinor, "99000000");

  const ctxMortgage = await ctx.debt.primaryMortgageContext(ctx.household.id);
  assert.ok(ctxMortgage);
  assert.equal(ctxMortgage.principalMinor, 990_000_00n);
});

test("R2-A5 — NW history rebuilds after ledger mutation (not insert-only stale)", async () => {
  const ctx = await setup();
  if (!ctx) return;

  await ctx.metrics.ensureNetWorthHistorySnapshots(
    ctx.household.id,
    AS_OF,
    2,
  );
  const before = await ctx.metrics.netWorthHistoryFromSnapshots(
    ctx.household.id,
    "SEK",
    AS_OF,
  );
  assert.ok(before.length >= 1);

  const beforeSnap = await ctx.db
    .select()
    .from(accountBalanceSnapshots)
    .where(
      and(
        eq(accountBalanceSnapshots.householdId, ctx.household.id),
        eq(accountBalanceSnapshots.source, "nw_history_reconstruct"),
        eq(accountBalanceSnapshots.accountId, ctx.bank.id),
      ),
    );
  assert.ok(beforeSnap.length >= 1);

  await ctx.events.createInternalTransfer({
    householdId: ctx.household.id,
    fromAccountId: ctx.bank.id,
    toAccountId: ctx.bankB.id,
    amountMinor: 40_000_00n,
    occurredOn: AS_OF,
    externalId: `r2-nw-${ctx.household.id}`,
  });

  // refreshDerivedCaches invalidates nw_history_reconstruct; ensure rebuilds.
  const after = await ctx.metrics.netWorthHistoryFromSnapshots(
    ctx.household.id,
    "SEK",
    AS_OF,
  );
  assert.ok(after.length >= 1);

  const asOfSnap = await ctx.db
    .select()
    .from(accountBalanceSnapshots)
    .where(
      and(
        eq(accountBalanceSnapshots.householdId, ctx.household.id),
        eq(accountBalanceSnapshots.accountId, ctx.bank.id),
        eq(accountBalanceSnapshots.source, "nw_history_reconstruct"),
      ),
    );

  const ledger = await ctx.ledger.reconstructHousehold(ctx.household.id);
  assert.equal(ledger.get(ctx.bank.id), 60_000_00n);

  const asOfMonthEnd = asOfSnap.filter(
    (s) => s.asOf.toISOString().slice(0, 10) >= "2026-07-31",
  );
  assert.ok(asOfMonthEnd.length >= 1);
  const latest = asOfMonthEnd.sort((a, b) =>
    a.asOf.toISOString().localeCompare(b.asOf.toISOString()),
  )[asOfMonthEnd.length - 1]!;
  assert.equal(latest.ledgerCalculatedBalanceMinor, 60_000_00n);
});
