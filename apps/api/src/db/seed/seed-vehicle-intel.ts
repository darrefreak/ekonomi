import { keepVsReplace, sellWindowHint } from "@ffos/financial-engine";
import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { vehicles } from "../schema-vehicles";
import {
  vehicleCandidates,
  vehicleComparisons,
  vehicleMarketSnapshots,
  vehicleReplacementPlans,
} from "../schema-vehicle-intel";

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

  const [c1] = await db
    .insert(vehicleCandidates)
    .values({
      householdId: input.householdId,
      name: "Toyota RAV4 Hybrid",
      make: "Toyota",
      model: "RAV4",
      modelYear: 2021,
      askPriceMinor: 329_000_00n,
      estimatedMonthlyEconomicMinor: 4_900_00n,
      notes: "Lägre drivmedel, högre pris",
    })
    .returning();
  const [c2] = await db
    .insert(vehicleCandidates)
    .values({
      householdId: input.householdId,
      name: "VW ID.4",
      make: "Volkswagen",
      model: "ID.4",
      modelYear: 2022,
      askPriceMinor: 349_000_00n,
      estimatedMonthlyEconomicMinor: 4_200_00n,
      notes: "El — lägre energi, högre kapitalkostnad",
    })
    .returning();

  const currentMonthly = 5_967_83n;
  for (const candidate of [c1, c2]) {
    const cmp = keepVsReplace({
      currentMonthlyEconomicMinor: currentMonthly,
      candidateMonthlyEconomicMinor: candidate.estimatedMonthlyEconomicMinor,
      switchingCostMinor: 15_000_00n,
    });
    await db.insert(vehicleComparisons).values({
      householdId: input.householdId,
      title: `Behåll XC60 vs ${candidate.name}`,
      currentVehicleId: vehicle.id,
      candidateId: candidate.id,
      monthlyDeltaMinor: cmp.monthlyDeltaMinor,
      confidence: String(cmp.confidence),
      recommendation: cmp.recommendation,
      summary: `Effektiv månadsdelta ${cmp.monthlyDeltaMinor} öre (minor). Rekommendation: ${cmp.recommendation}.`,
    });
  }

  const hint = sellWindowHint(80_000_00n, 10);
  await db.insert(vehicleReplacementPlans).values({
    householdId: input.householdId,
    vehicleId: vehicle.id,
    sellWindowStart: "2027-03-01",
    sellWindowEnd: "2027-09-01",
    targetEquityMinor: 90_000_00n,
    status: hint.status,
    summary: hint.summary,
  });
}
