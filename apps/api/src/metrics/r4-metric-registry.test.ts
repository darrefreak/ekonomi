import assert from "node:assert/strict";
import { test } from "node:test";
import {
  METRIC_BUNDLE_VERSION,
  metricCatalogCalculationVersion,
} from "@ffos/financial-engine";
import { AuditService } from "../audit/audit.service";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { accounts } from "../db/schema-economic";
import type { HouseholdAccessService } from "../households/household-access.service";
import { EconomicEventsService } from "../ledger/economic-events.service";
import { LedgerTruthService } from "../ledger/ledger-truth.service";
import { stubMerchantsService } from "../merchants/merchants.service.stub";
import { NetWorthService } from "../net-worth/net-worth.service";
import { ReportsService } from "../reports/reports.service";
import { HouseholdMetricsService } from "./household-metrics.service";
import { MetricRegistryService } from "./metric-registry.service";

const AS_OF = "2026-08-01";
const AS_OF_ALT = "2026-07-15";

async function setup() {
  if (!process.env.DATABASE_URL) return null;
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name: `R4 Metrics ${Date.now()}`, baseCurrency: "SEK" })
    .returning();

  const mk = async (values: typeof accounts.$inferInsert) => {
    const [row] = await db.insert(accounts).values(values).returning();
    return row;
  };

  const bank = await mk({
    householdId: household.id,
    name: "R4 Checking",
    accountType: "CHECKING",
    openingBalanceMinor: 80_000_00n,
    currentBalanceMinor: 80_000_00n,
    isShared: true,
  });
  const savings = await mk({
    householdId: household.id,
    name: "R4 Savings",
    accountType: "SAVINGS",
    openingBalanceMinor: 20_000_00n,
    currentBalanceMinor: 20_000_00n,
    isShared: true,
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
  } as unknown as HouseholdAccessService;

  const audit = new AuditService();
  const ledger = new LedgerTruthService(audit);
  const events = new EconomicEventsService(ledger, audit, stubMerchantsService());
  const metrics = new HouseholdMetricsService();
  const registry = new MetricRegistryService(metrics);
  const netWorth = new NetWorthService(access, metrics);
  const reports = new ReportsService(access, metrics);

  return {
    db,
    household,
    bank,
    savings,
    events,
    metrics,
    registry,
    netWorth,
    reports,
  };
}

test("R4-T1 — inputHash changes when composition changes with same cash total", async () => {
  const ctx = await setup();
  if (!ctx) return;

  const before = await ctx.metrics.getFinancialSnapshot(
    ctx.household.id,
    "SEK",
    AS_OF,
  );
  assert.equal(before.position.availableCash.amountMinor, 100_000_00n);

  // Internal transfer: cash total unchanged, per-account composition changes.
  await ctx.events.createInternalTransfer({
    householdId: ctx.household.id,
    fromAccountId: ctx.bank.id,
    toAccountId: ctx.savings.id,
    amountMinor: 15_000_00n,
    occurredOn: AS_OF,
    externalId: `r4-comp-${ctx.household.id}`,
  });

  const after = await ctx.metrics.getFinancialSnapshot(
    ctx.household.id,
    "SEK",
    AS_OF,
  );
  assert.equal(after.position.availableCash.amountMinor, 100_000_00n);
  assert.equal(
    after.position.netWorth.amountMinor,
    before.position.netWorth.amountMinor,
  );
  assert.notEqual(after.metricMeta.inputHash, before.metricMeta.inputHash);
});

test("R4-T2 — metricMeta.calculationVersion is catalog fingerprint, not bundle", async () => {
  const ctx = await setup();
  if (!ctx) return;

  const snap = await ctx.metrics.getFinancialSnapshot(
    ctx.household.id,
    "SEK",
    AS_OF,
  );
  const expected = metricCatalogCalculationVersion();
  assert.equal(snap.metricMeta.bundleVersion, METRIC_BUNDLE_VERSION);
  assert.equal(snap.metricMeta.calculationVersion, expected);
  assert.notEqual(snap.metricMeta.calculationVersion, METRIC_BUNDLE_VERSION);
  assert.equal(snap.metricMeta.metricVersions?.net_worth, "1.0.0");
});

test("R4-T3 — product asOf query is honored (net-worth)", async () => {
  const ctx = await setup();
  if (!ctx) return;

  const nw = await ctx.netWorth.get("user-1", ctx.household.id, AS_OF_ALT);
  assert.equal(nw.asOf, AS_OF_ALT);
  assert.equal(nw.metricMeta?.asOf, AS_OF_ALT);
});

test("R4-T4 — yearly report inputHash is derived, not yearly-${y}", async () => {
  const ctx = await setup();
  if (!ctx) return;

  const yearly = await ctx.reports.yearly(
    "user-1",
    ctx.household.id,
    2026,
    AS_OF,
  );
  assert.ok(yearly.metricMeta?.inputHash);
  assert.equal(yearly.metricMeta!.inputHash.startsWith("yearly-"), false);
  assert.match(yearly.metricMeta!.inputHash, /^fnv1a_/);
  assert.notEqual(
    yearly.metricMeta!.calculationVersion,
    METRIC_BUNDLE_VERSION,
  );
});

test("R4-T5 — stored snapshot serve does not rematerialize under live path", async () => {
  const ctx = await setup();
  if (!ctx) return;

  const live = await ctx.registry.materializeSnapshots(
    ctx.household.id,
    "SEK",
    AS_OF,
  );
  const nwItem = live.items.find((i) => i.metricKey === "net_worth");
  assert.ok(nwItem);

  const stored = await ctx.registry.getStoredSnapshots(
    ctx.household.id,
    AS_OF,
    {
      metricKey: "net_worth",
      calculationVersion: nwItem!.calculationVersion,
    },
  );
  assert.equal(stored.servedFrom, "stored");
  assert.equal(stored.items.length, 1);
  assert.equal(stored.items[0]!.valueMinor, nwItem!.valueMinor);
  assert.equal(stored.items[0]!.calculationVersion, nwItem!.calculationVersion);
  assert.equal(stored.asOf, AS_OF);
});
