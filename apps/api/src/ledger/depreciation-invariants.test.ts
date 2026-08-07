import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { money } from "@ffos/domain";
import { calculateNetWorth } from "@ffos/financial-engine";
import { AuditService } from "../audit/audit.service";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { accounts, financialEvents } from "../db/schema-economic";
import { EconomicEventsService } from "./economic-events.service";
import { LedgerTruthService } from "./ledger-truth.service";

const AS_OF = "2026-08-01";

test("A3 — vehicle depreciation 300k→280k persisted invariants", async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();

  const [household] = await db
    .insert(households)
    .values({ name: `A3 Depreciation ${Date.now()}`, baseCurrency: "SEK" })
    .returning();

  const mk = async (values: typeof accounts.$inferInsert) => {
    const [row] = await db.insert(accounts).values(values).returning();
    return row;
  };

  const cash = await mk({
    householdId: household.id,
    name: "A3 Cash",
    accountType: "CHECKING",
    openingBalanceMinor: 50_000_00n,
    currentBalanceMinor: 50_000_00n,
    reportedBalanceMinor: 50_000_00n,
    isShared: true,
  });
  const vehicle = await mk({
    householdId: household.id,
    name: "A3 Vehicle Asset",
    accountType: "ASSET",
    openingBalanceMinor: 300_000_00n,
    currentBalanceMinor: 300_000_00n,
    reportedBalanceMinor: 300_000_00n,
    isShared: true,
  });
  const expense = await mk({
    householdId: household.id,
    name: "A3 Expense",
    accountType: "EXPENSE",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
    isSystem: true,
  });

  const audit = new AuditService();
  const ledger = new LedgerTruthService(audit);
  const events = new EconomicEventsService(ledger, audit);

  const before = await ledger.reconstructHousehold(household.id);
  const beforeNw = calculateNetWorth({
    cash: money(before.get(cash.id) ?? 0n, "SEK"),
    investments: money(0n, "SEK"),
    assets: money(before.get(vehicle.id) ?? 0n, "SEK"),
    liabilities: money(0n, "SEK"),
  });

  const event = await events.createAssetDepreciation({
    householdId: household.id,
    assetAccountId: vehicle.id,
    expenseAccountId: expense.id,
    amountMinor: 20_000_00n,
    occurredOn: AS_OF,
    description: "A3 depreciation",
  });

  assert.equal(event.expenseAmountMinor, 0n);
  assert.equal(event.netWorthDeltaMinor, -20_000_00n);

  const after = await ledger.reconstructHousehold(household.id);
  assert.equal(after.get(vehicle.id), 280_000_00n);
  assert.equal(after.get(cash.id), 50_000_00n);

  const afterNw = calculateNetWorth({
    cash: money(after.get(cash.id) ?? 0n, "SEK"),
    investments: money(0n, "SEK"),
    assets: money(after.get(vehicle.id) ?? 0n, "SEK"),
    liabilities: money(0n, "SEK"),
  });
  assert.equal(afterNw.amountMinor, beforeNw.amountMinor - 20_000_00n);

  const [row] = await db
    .select()
    .from(financialEvents)
    .where(eq(financialEvents.id, event.id))
    .limit(1);
  assert.equal(row.expenseAmountMinor, 0n);
  assert.equal(row.netWorthDeltaMinor, -20_000_00n);
});
