import assert from "node:assert/strict";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import {
  opportunitiesResponseSchema,
  riskResponseSchema,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { accounts } from "../db/schema-economic";
import type { HouseholdAccessService } from "../households/household-access.service";
import { DebtService } from "../debt/debt.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { PlanningMetricsService } from "../planning/planning-metrics.service";
import { VehiclesService } from "../vehicles/vehicles.service";
import { DecisionsService } from "./decisions.service";

test("opportunities and risk are live-engine with evidence", async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  // Prefer seeded demo household — parallel invariant suites create extra mortgages.
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.name, "Familjen Demo"))
    .limit(1);
  if (!household) return;
  const [account] = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.householdId, household.id),
        eq(accounts.accountType, "MORTGAGE"),
      ),
    )
    .limit(1);
  if (!account) return;

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
  } as unknown as HouseholdAccessService;

  const service = new DecisionsService(
    access,
    new HouseholdMetricsService(),
    new PlanningMetricsService(),
    new DebtService(access),
    new VehiclesService(access),
  );

  const opps = opportunitiesResponseSchema.parse(
    await service.opportunities("user-1", household.id),
  );
  assert.equal(opps.source, "live-engine");
  assert.ok(opps.items.length >= 1);
  assert.ok(opps.items.every((i) => (i.evidence ?? []).length >= 1));
  assert.ok(opps.lifestyleCreep);
  assert.ok(typeof opps.lifestyleCreep!.creeping === "boolean");

  const risk = riskResponseSchema.parse(
    await service.risk("user-1", household.id),
  );
  assert.equal(risk.source, "live-engine");
  assert.ok(risk.signals.length >= 3);
  assert.ok(risk.health.length >= 3);
  assert.ok(risk.signals.every((s) => (s.evidence ?? []).length >= 1));
});
