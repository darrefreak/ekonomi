import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { vehicles } from "../schema-vehicles";
import {
  vehicleCandidates,
  vehicleMarketSnapshots,
} from "../schema-vehicle-intel";

/** Seed mock listings only — compare/replace/sell-window computed live on read. */
export async function seedVehicleIntelData(input: {
  householdId: string;
  asOf: string;
}) {
  const db = getDb();
  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.householdId, input.householdId))
    .limit(1);
  if (!vehicle) return;

  await db.insert(vehicleMarketSnapshots).values({
    householdId: input.householdId,
    vehicleId: vehicle.id,
    asOf: input.asOf,
    askLowMinor: 250_000_00n,
    askMidMinor: 278_000_00n,
    askHighMinor: 310_000_00n,
    sampleSize: 18,
    notes: "Mock ask-priser (ej verifierade försäljningar)",
  });

  await db.insert(vehicleCandidates).values([
    {
      householdId: input.householdId,
      name: "Toyota RAV4 Hybrid",
      make: "Toyota",
      model: "RAV4",
      modelYear: 2021,
      askPriceMinor: 329_000_00n,
      estimatedMonthlyEconomicMinor: 4_900_00n,
      notes: "Lägre drivmedel, högre pris",
    },
    {
      householdId: input.householdId,
      name: "VW ID.4",
      make: "Volkswagen",
      model: "ID.4",
      modelYear: 2022,
      askPriceMinor: 349_000_00n,
      estimatedMonthlyEconomicMinor: 4_200_00n,
      notes: "El — lägre energi, högre kapitalkostnad",
    },
  ]);
}
