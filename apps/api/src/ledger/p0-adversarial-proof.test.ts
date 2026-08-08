import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { accounts, financialEvents } from "../db/schema-economic";
import { EconomicEventsService } from "./economic-events.service";
import { LedgerTruthService } from "./ledger-truth.service";
import { stubMerchantsService } from "../merchants/merchants.service.stub";

/**
 * P0 adversarial proofs — re-verified after R1 remediation.
 * Depreciation idempotency and transactional persist are required PASS.
 */

test("P0-A2 re-verify — depreciation externalId is idempotent", async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name: `P0 Adv Depr ${Date.now()}`, baseCurrency: "SEK" })
    .returning();

  const mk = async (values: typeof accounts.$inferInsert) => {
    const [row] = await db.insert(accounts).values(values).returning();
    return row;
  };
  const vehicle = await mk({
    householdId: household.id,
    name: "Adv Vehicle",
    accountType: "ASSET",
    openingBalanceMinor: 300_000_00n,
    currentBalanceMinor: 300_000_00n,
    isShared: true,
  });
  const expense = await mk({
    householdId: household.id,
    name: "Adv Expense",
    accountType: "EXPENSE",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    isShared: true,
    isSystem: true,
  });

  const ledger = new LedgerTruthService(new AuditService());
  const events = new EconomicEventsService(ledger, new AuditService(), stubMerchantsService());
  const externalId = `adv-depr-${household.id}`;

  const first = await events.createAssetDepreciation({
    householdId: household.id,
    assetAccountId: vehicle.id,
    expenseAccountId: expense.id,
    amountMinor: 10_000_00n,
    occurredOn: "2026-08-01",
    externalId,
  });
  const second = await events.createAssetDepreciation({
    householdId: household.id,
    assetAccountId: vehicle.id,
    expenseAccountId: expense.id,
    amountMinor: 10_000_00n,
    occurredOn: "2026-08-01",
    externalId,
  });

  const rows = await db
    .select()
    .from(financialEvents)
    .where(eq(financialEvents.householdId, household.id));
  const bal = await ledger.reconstructHousehold(household.id);

  assert.equal(first.id, second.id);
  assert.equal(rows.length, 1);
  assert.equal(bal.get(vehicle.id), 290_000_00n);
});

test("P0-A1 re-verify — persist path uses db.transaction", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const src = await fs.readFile(
    path.join(process.cwd(), "src/db/seed/persist-event.ts"),
    "utf8",
  );
  assert.equal(
    /\.transaction\s*\(/.test(src),
    true,
    "persist-event must wrap multi-write path in a transaction",
  );
});
