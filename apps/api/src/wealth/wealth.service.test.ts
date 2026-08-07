import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  assetsResponseSchema,
  investmentsResponseSchema,
  netWorthResponseSchema,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { accounts } from "../db/schema-economic";
import type { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { WealthService } from "./wealth.service";

test("investments and assets APIs return ledger-backed wealth", async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const [inv] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.accountType, "INVESTMENT"))
    .limit(1);
  if (!inv) return;

  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, inv.householdId))
    .limit(1);
  if (!household) return;

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
  } as unknown as HouseholdAccessService;

  const wealth = new WealthService(access);
  const investments = investmentsResponseSchema.parse(
    await wealth.investments("user-1", household.id),
  );
  assert.ok(investments.items.length >= 1);
  assert.ok(BigInt(investments.totals.balance.amountMinor) >= 0n);
  assert.ok(Array.isArray(investments.recentContributions));

  const assets = assetsResponseSchema.parse(
    await wealth.assets("user-1", household.id),
  );
  assert.ok(Array.isArray(assets.items));
  assert.ok(BigInt(assets.totals.estimatedValue.amountMinor) >= 0n);
});

test("net worth history comes from account_balance_snapshots", async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const [inv] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.accountType, "INVESTMENT"))
    .limit(1);
  if (!inv) return;

  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, inv.householdId))
    .limit(1);
  if (!household) return;

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
  } as unknown as HouseholdAccessService;

  const metrics = new HouseholdMetricsService();
  const service = new NetWorthService(access, metrics);
  const nw = netWorthResponseSchema.parse(
    await service.get("user-1", household.id),
  );
  assert.ok(nw.history.length >= 2);
  assert.ok(nw.history.every((h) => h.source === "account_balance_snapshots"));
  assert.ok(nw.attribution.length >= 1);
  for (let i = 1; i < nw.history.length; i += 1) {
    assert.ok(nw.history[i]!.asOf >= nw.history[i - 1]!.asOf);
  }
});
