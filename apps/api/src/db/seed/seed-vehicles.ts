import { getDb } from "../client";
import { accounts } from "../schema-economic";
import {
  vehicleCostEvents,
  vehicleFinanceAgreements,
  vehicleOdometerReadings,
  vehicleOwnerships,
  vehicles,
  vehicleUsageProfiles,
} from "../schema-vehicles";

type SeedVehiclesInput = {
  householdId: string;
  asOf: string;
  assetAccountId: string;
};

export async function seedVehiclesData(input: SeedVehiclesInput) {
  const db = getDb();

  const [loanAccount] = await db
    .insert(accounts)
    .values({
      householdId: input.householdId,
      name: "Billån Santander",
      provider: "Santander",
      accountType: "LOAN",
      isShared: true,
      currency: "SEK",
      currentBalanceMinor: 195_000_00n,
      interestRateBps: 495,
      externalReference: "CAR-LOAN-DEMO",
    })
    .returning();

  const [vehicle] = await db
    .insert(vehicles)
    .values({
      householdId: input.householdId,
      name: "Familjebil",
      make: "Volvo",
      model: "XC60",
      modelYear: 2019,
      registrationNumber: "ABC123",
      fuelType: "diesel",
      purchasePriceMinor: 389_000_00n,
      purchaseDate: "2022-04-15",
      estimatedValueLowMinor: 255_000_00n,
      estimatedValueMidMinor: 280_000_00n,
      estimatedValueHighMinor: 305_000_00n,
      valuationAsOf: input.asOf,
      linkedAssetAccountId: input.assetAccountId,
      linkedLoanAccountId: loanAccount.id,
      notes: "Demo-fordon för TCO/equity",
    })
    .returning();

  await db.insert(vehicleOwnerships).values({
    householdId: input.householdId,
    vehicleId: vehicle.id,
    ownershipType: "FINANCED",
    ownerSharePercent: "100",
    startedOn: "2022-04-15",
  });

  await db.insert(vehicleUsageProfiles).values({
    householdId: input.householdId,
    vehicleId: vehicle.id,
    annualKm: 16_500,
    commuteSharePercent: "55",
  });

  await db.insert(vehicleFinanceAgreements).values({
    householdId: input.householdId,
    vehicleId: vehicle.id,
    lender: "Santander Consumer Bank",
    principalMinor: 280_000_00n,
    remainingMinor: 195_000_00n,
    interestRateBps: 495,
    monthlyPaymentMinor: 4_250_00n,
    startDate: "2022-04-15",
    endDate: "2029-04-15",
  });

  await db.insert(vehicleOdometerReadings).values([
    {
      householdId: input.householdId,
      vehicleId: vehicle.id,
      readingKm: 62_400,
      recordedOn: "2025-08-01",
      source: "manual",
    },
    {
      householdId: input.householdId,
      vehicleId: vehicle.id,
      readingKm: 78_900,
      recordedOn: input.asOf,
      source: "manual",
    },
  ]);

  const costRows: Array<{
    kind:
      | "ENERGY"
      | "INSURANCE"
      | "TAX"
      | "SERVICE"
      | "REPAIR"
      | "TIRES"
      | "PARKING"
      | "LOAN_PRINCIPAL"
      | "LOAN_INTEREST"
      | "DEPRECIATION";
    occurredOn: string;
    amountMinor: bigint;
    isEconomicCost: boolean;
    description: string;
    odometerKm?: number;
  }> = [
    {
      kind: "INSURANCE",
      occurredOn: "2026-01-12",
      amountMinor: 5_400_00n,
      isEconomicCost: true,
      description: "Helårsförsäkring",
    },
    {
      kind: "TAX",
      occurredOn: "2026-03-01",
      amountMinor: 2_164_00n,
      isEconomicCost: true,
      description: "Fordonsskatt",
    },
    {
      kind: "SERVICE",
      occurredOn: "2026-05-18",
      amountMinor: 4_890_00n,
      isEconomicCost: true,
      description: "Service 75 000 km",
      odometerKm: 75_200,
    },
    {
      kind: "TIRES",
      occurredOn: "2026-04-02",
      amountMinor: 6_200_00n,
      isEconomicCost: true,
      description: "Sommarhjul",
    },
    {
      kind: "REPAIR",
      occurredOn: "2026-06-22",
      amountMinor: 3_150_00n,
      isEconomicCost: true,
      description: "Bromsbelägg",
      odometerKm: 77_100,
    },
    {
      kind: "PARKING",
      occurredOn: "2026-07-10",
      amountMinor: 850_00n,
      isEconomicCost: true,
      description: "Pendlarparkering juli",
    },
    {
      kind: "DEPRECIATION",
      occurredOn: "2026-07-31",
      amountMinor: 18_000_00n,
      isEconomicCost: true,
      description: "Uppskattad värdeminskning 12 mån (ackumulerad demo)",
    },
  ];

  // Monthly energy + loan split for last 12 months
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(`${input.asOf}T00:00:00.000Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    const occurredOn = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-15`;
    costRows.push(
      {
        kind: "ENERGY",
        occurredOn,
        amountMinor: 1_350_00n + BigInt(i % 3) * 80_00n,
        isEconomicCost: true,
        description: "Drivmedel",
      },
      {
        kind: "LOAN_PRINCIPAL",
        occurredOn,
        amountMinor: 3_100_00n,
        isEconomicCost: false,
        description: "Billån amortering",
      },
      {
        kind: "LOAN_INTEREST",
        occurredOn,
        amountMinor: 1_150_00n,
        isEconomicCost: true,
        description: "Billån ränta",
      },
    );
  }

  await db.insert(vehicleCostEvents).values(
    costRows.map((c) => ({
      householdId: input.householdId,
      vehicleId: vehicle.id,
      kind: c.kind,
      occurredOn: c.occurredOn,
      amountMinor: c.amountMinor,
      isEconomicCost: c.isEconomicCost,
      description: c.description,
      odometerKm: c.odometerKm,
    })),
  );

  return { vehicleId: vehicle.id, loanAccountId: loanAccount.id };
}
