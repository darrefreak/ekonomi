import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  createScenarioSchema,
  forecastResponseSchema,
  scenarioSimulationResponseSchema,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { accounts } from "../db/schema-economic";
import { scenarios } from "../db/schema-decisions";
import type { HouseholdAccessService } from "../households/household-access.service";
import { DebtService } from "../debt/debt.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { PlanningMetricsService } from "../planning/planning-metrics.service";
import { VehiclesService } from "../vehicles/vehicles.service";
import { DecisionsService } from "./decisions.service";

test("createScenarioSchema accepts assumption minors", () => {
  const parsed = createScenarioSchema.parse({
    householdId: "11111111-1111-4111-8111-111111111111",
    name: "Test",
    assumptions: { monthlyIncomeDeltaMinor: "-1000000" },
  });
  assert.equal(parsed.assumptions.monthlyIncomeDeltaMinor, "-1000000");
});

test("live forecast horizons and non-destructive scenario simulate", async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const [account] = await db.select().from(accounts).limit(1);
  if (!account) return;
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, account.householdId))
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
    requireAdmin: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
    accountVisibility: async () => "full" as const,
    projectAccountListItem: <T>(item: T) => item,
    projectTransactionItem: <T>(item: T) => item,
  } as unknown as HouseholdAccessService;

  const metrics = new HouseholdMetricsService();
  const service = new DecisionsService(
    access,
    metrics,
    new PlanningMetricsService(),
    new DebtService(access, metrics),
    new VehiclesService(access),
  );

  const forecast = forecastResponseSchema.parse(
    await service.forecast("user-1", household.id),
  );
  assert.equal(forecast.source, "live-engine");
  assert.equal(forecast.points.length, 6);
  assert.deepEqual(
    forecast.points.map((p) => p.label),
    ["7d", "30d", "60d", "90d", "6m", "12m"],
  );

  const backtest = await service.backtest("user-1", household.id);
  assert.ok(backtest.comparisons.length >= 1);
  assert.ok(backtest.metrics.length >= 1);

  const beforeAccounts = await db
    .select({ bal: accounts.currentBalanceMinor })
    .from(accounts)
    .where(eq(accounts.householdId, household.id));

  const created = await service.createScenario("user-1", {
    householdId: household.id,
    name: `WS E ${Date.now()}`,
    description: "test",
    assumptions: {
      monthlyIncomeDeltaMinor: "-500000",
      monthlyExpenseDeltaMinor: "0",
      oneTimeCashDeltaMinor: "0",
    },
  });
  const scenario = created.items.find((s) => s.name.startsWith("WS E"));
  assert.ok(scenario);

  const sim = scenarioSimulationResponseSchema.parse(
    await service.simulateScenario("user-1", scenario!.id, {
      householdId: household.id,
    }),
  );
  assert.equal(sim.ledgerMutated, false);
  assert.equal(sim.points.length, 6);

  const afterAccounts = await db
    .select({ bal: accounts.currentBalanceMinor })
    .from(accounts)
    .where(eq(accounts.householdId, household.id));
  assert.deepEqual(
    afterAccounts.map((a) => a.bal.toString()),
    beforeAccounts.map((a) => a.bal.toString()),
  );

  await db.delete(scenarios).where(eq(scenarios.id, scenario!.id));
});
