import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { accounts, financialEvents } from "../db/schema-economic";
import { EconomicEventsService } from "./economic-events.service";
import { LedgerTruthService } from "./ledger-truth.service";

/**
 * Adversarial proofs for P0 acceptance — intentionally looks for remaining breakage.
 */

test("P0-A proof — depreciation externalId is NOT idempotent (no source_tx row)", async () => {
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
  const events = new EconomicEventsService(ledger, new AuditService());
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

  // Documented failure: same externalId creates a second write-down.
  assert.notEqual(first.id, second.id);
  assert.equal(rows.length, 2);
  assert.equal(bal.get(vehicle.id), 280_000_00n);
});

test("P0-A proof — persist path has no db.transaction wrapper", async () => {
  // Static adversarial check: multi-write persist must be transactional for P0.
  const fs = await import("node:fs/promises");
  const path = new URL("../db/seed/persist-event.ts", import.meta.url);
  const src = await fs.readFile(path, "utf8");
  assert.equal(
    /db\.transaction|\.transaction\s*\(/.test(src),
    false,
    "persist-event still has no transaction — partial write risk remains",
  );
});
