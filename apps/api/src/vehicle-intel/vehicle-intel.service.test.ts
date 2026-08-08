import assert from "node:assert/strict";
import { requireTestDatabase } from "../testing/require-test-database";
import { requireDemoVehicle } from "../testing/demo-fixture";
import { test } from "node:test";
import { vehicleMarketResponseSchema } from "@ffos/schemas";
import type { HouseholdAccessService } from "../households/household-access.service";
import { VehiclesService } from "../vehicles/vehicles.service";
import { VehicleIntelService } from "./vehicle-intel.service";

test("vehicle market recomputes compare/replace live from TCO", async () => {
  requireTestDatabase();
  const { household, vehicle } = await requireDemoVehicle();

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
  } as unknown as HouseholdAccessService;

  const vehiclesService = new VehiclesService(access);
  const intel = new VehicleIntelService(access, vehiclesService);
  const market = vehicleMarketResponseSchema.parse(
    await intel.market("user-1", household.id, vehicle.id),
  );

  assert.equal(market.analysisSource, "live_over_mock_listings");
  assert.equal(market.vehicleId, vehicle.id);
  assert.ok(market.currentMonthlyEconomic);
  assert.ok(market.candidates.length >= 1);
  assert.ok(market.comparisons.length >= 1);
  assert.ok(market.replacement);
  assert.ok(
    ["WAIT", "WINDOW", "WATCH", "SELL_NOW"].includes(market.replacement!.status),
  );
  assert.ok(market.analytics);

  const detail = await vehiclesService.get("user-1", household.id, vehicle.id);
  assert.equal(
    market.currentMonthlyEconomic!.amountMinor,
    detail.metrics.monthlyEconomicCost.amountMinor,
  );
  assert.ok((detail.linkedEvents ?? []).length >= 1);
  assert.ok((detail.odometerHistory ?? []).length >= 1);
  assert.ok((detail.costs ?? []).length >= 1);
});
