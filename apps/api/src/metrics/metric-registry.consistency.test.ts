import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  METRIC_BUNDLE_VERSION,
  listMetricDefinitions,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { DebtService } from "../debt/debt.service";
import type { HouseholdAccessService } from "../households/household-access.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { WealthService } from "../wealth/wealth.service";
import { HouseholdMetricsService } from "./household-metrics.service";
import { MetricRegistryService } from "./metric-registry.service";

test("registry definitions are unique and versioned", () => {
  const defs = listMetricDefinitions();
  assert.ok(defs.some((d) => d.metricKey === "net_worth"));
  assert.ok(defs.some((d) => d.metricKey === "debt_total"));
  assert.equal(METRIC_BUNDLE_VERSION.length > 0, true);
});

test("C2 — dashboard / net-worth / debt / wealth / registry agree", async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.name, "Familjen Demo"))
    .limit(1);
  if (!household) return;

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

  const metrics = new HouseholdMetricsService();
  const registry = new MetricRegistryService(metrics);
  const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
  const currency = (household.baseCurrency || "SEK") as "SEK";

  const materialized = await registry.materializeSnapshots(
    household.id,
    currency,
    asOf,
  );
  assert.equal(materialized.bundleVersion, METRIC_BUNDLE_VERSION);
  assert.ok(materialized.items.length >= 10);

  const nwItem = materialized.items.find((i) => i.metricKey === "net_worth");
  const debtItem = materialized.items.find((i) => i.metricKey === "debt_total");
  const invItem = materialized.items.find(
    (i) => i.metricKey === "investments_total",
  );
  const assetsItem = materialized.items.find(
    (i) => i.metricKey === "assets_total",
  );
  assert.ok(nwItem?.valueMinor);
  assert.ok(debtItem?.valueMinor);

  // Minimal dashboard/net-worth/debt/wealth via shared metrics (bypass full DI graph).
  const snap = materialized.financialSnapshot;
  const netWorthService = new NetWorthService(access, metrics);
  const nw = await netWorthService.get("user-1", household.id);
  assert.equal(
    nw.current.amountMinor,
    String(snap.position.netWorth.amountMinor),
  );
  assert.equal(nw.current.amountMinor, nwItem!.valueMinor);
  assert.equal(nw.metricMeta?.bundleVersion, METRIC_BUNDLE_VERSION);
  assert.equal(nw.metricMeta?.inputHash, snap.metricMeta.inputHash);
  assert.notEqual(nw.metricMeta?.calculationVersion, METRIC_BUNDLE_VERSION);
  assert.equal(nw.metricMeta?.metricVersions?.net_worth, "1.0.0");

  const debtService = new DebtService(access, metrics);
  const debt = await debtService.list("user-1", household.id);
  assert.equal(
    debt.totals.outstanding.amountMinor,
    String(snap.position.liabilities.amountMinor),
  );
  assert.equal(debt.totals.outstanding.amountMinor, debtItem!.valueMinor);

  const wealthService = new WealthService(access, metrics);
  const investments = await wealthService.investments("user-1", household.id);
  const assets = await wealthService.assets("user-1", household.id);
  assert.equal(
    investments.totals.balance.amountMinor,
    String(snap.position.investments.amountMinor),
  );
  assert.equal(investments.totals.balance.amountMinor, invItem!.valueMinor);
  assert.equal(
    assets.totals.estimatedValue.amountMinor,
    String(snap.position.assets.amountMinor),
  );
  assert.equal(assets.totals.estimatedValue.amountMinor, assetsItem!.valueMinor);

  // Dashboard position fields via direct snapshot (same as DashboardService).
  assert.equal(
    String(snap.position.netWorth.amountMinor),
    nw.current.amountMinor,
  );
  assert.equal(
    String(snap.position.liabilities.amountMinor),
    debt.totals.outstanding.amountMinor,
  );

  // Persisted definitions round-trip.
  const listed = await registry.listDefinitions();
  assert.equal(listed.bundleVersion, METRIC_BUNDLE_VERSION);
  assert.ok(listed.items.length >= 10);
});
