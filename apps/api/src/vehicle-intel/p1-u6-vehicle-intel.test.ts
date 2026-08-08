import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { vehicleMarketResponseSchema } from "@ffos/schemas";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { vehicles } from "../db/schema-vehicles";
import type { HouseholdAccessService } from "../households/household-access.service";
import { VehiclesService } from "../vehicles/vehicles.service";
import { VehicleIntelService } from "./vehicle-intel.service";

function accessStub(household: typeof households.$inferSelect) {
  return {
    requireMembership: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
  } as unknown as HouseholdAccessService;
}

test("P1-U6: market analytics from seed listings with ask labels", async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const [vehicle] = await db.select().from(vehicles).limit(1);
  if (!vehicle) return;

  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, vehicle.householdId))
    .limit(1);
  if (!household) return;

  const intel = new VehicleIntelService(
    accessStub(household),
    new VehiclesService(accessStub(household)),
  );

  const market = vehicleMarketResponseSchema.parse(
    await intel.market("user-1", household.id, vehicle.id),
  );

  assert.equal(market.analysisSource, "live_over_mock_listings");
  assert.ok(market.analytics);
  assert.ok((market.analytics?.comparableCount ?? 0) >= 5);
  assert.ok(market.analytics?.stats?.askLabel?.includes("annonseras"));
  assert.ok(market.snapshot);
  assert.ok(market.analytics?.valuation);
  assert.ok(market.analytics?.trend);
  assert.ok(market.analytics?.liquidity);
  assert.ok(market.recommendation);
  assert.ok(market.lease);
  assert.ok(market.householdRequirements);
  assert.equal(market.householdRequirements?.homeChargingAvailable, false);
});

test("P1-U6: candidate create + MUST_HAVE rejection in recommendation", async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const [vehicle] = await db.select().from(vehicles).limit(1);
  if (!vehicle) return;

  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, vehicle.householdId))
    .limit(1);
  if (!household) return;

  const access = accessStub(household);
  const intel = new VehicleIntelService(
    access,
    new VehiclesService(access),
  );

  const created = await intel.createCandidate("user-1", {
    householdId: household.id,
    name: "Test EV",
    make: "Volvo",
    model: "EX30",
    modelYear: 2024,
    askPriceMinor: "32000000",
    estimatedMonthlyEconomicMinor: "380000",
    isElectric: true,
    seats: 5,
    isofixCount: 2,
    cargoOk: true,
  });
  assert.ok(created.id);

  const market = vehicleMarketResponseSchema.parse(
    await intel.market("user-1", household.id, vehicle.id),
  );

  const ev = market.candidates.find((c) => c.name.includes("XC40 Recharge"));
  assert.ok(ev);
  assert.ok(ev?.fit?.mustHaveFailures.some((f) => f.includes("Hemmaladdning")));

  assert.equal(market.recommendation?.kind, "KEEP");
  assert.match(
    market.recommendation?.householdFit ?? "",
    /MUST_HAVE/i,
  );

  await intel.archiveCandidate("user-1", household.id, created.id);
});
