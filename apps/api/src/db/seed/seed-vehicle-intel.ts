import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { vehicles } from "../schema-vehicles";
import {
  vehicleCandidates,
  vehicleHouseholdRequirements,
  vehicleLeaseAgreements,
  vehicleMarketHistoryPoints,
  vehicleMarketListings,
} from "../schema-vehicle-intel";

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Seed mock XC60 listings, history, household fit, candidates, and one lease row. */
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

  const subjectId = vehicle.id;
  const asOf = input.asOf;

  const listingSpecs: Array<{
    key: string;
    year: number;
    mileageKm: number;
    ask: bigint;
    prevAsk?: bigint;
    fuel?: string;
    variant?: string;
    listedOn: string;
    removedOn?: string;
  }> = [
    { key: "xc60-01", year: 2019, mileageKm: 74_200, ask: 279_000_00n, listedOn: addDays(asOf, -12) },
    { key: "xc60-02", year: 2019, mileageKm: 81_500, ask: 268_000_00n, prevAsk: 279_000_00n, listedOn: addDays(asOf, -28) },
    { key: "xc60-03", year: 2018, mileageKm: 92_100, ask: 252_000_00n, listedOn: addDays(asOf, -35) },
    { key: "xc60-04", year: 2020, mileageKm: 58_400, ask: 312_000_00n, listedOn: addDays(asOf, -8) },
    { key: "xc60-05", year: 2019, mileageKm: 76_800, ask: 275_500_00n, listedOn: addDays(asOf, -19) },
    { key: "xc60-06", year: 2019, mileageKm: 83_200, ask: 264_000_00n, prevAsk: 272_000_00n, listedOn: addDays(asOf, -41) },
    { key: "xc60-07", year: 2018, mileageKm: 88_900, ask: 258_000_00n, listedOn: addDays(asOf, -22) },
    { key: "xc60-08", year: 2020, mileageKm: 61_200, ask: 305_000_00n, listedOn: addDays(asOf, -15) },
    { key: "xc60-09", year: 2019, mileageKm: 79_400, ask: 271_000_00n, listedOn: addDays(asOf, -33) },
    { key: "xc60-10", year: 2019, mileageKm: 72_600, ask: 282_000_00n, listedOn: addDays(asOf, -6) },
    { key: "xc60-11", year: 2018, mileageKm: 95_300, ask: 245_000_00n, listedOn: addDays(asOf, -52), removedOn: addDays(asOf, -10) },
    { key: "xc60-12", year: 2020, mileageKm: 55_800, ask: 318_000_00n, listedOn: addDays(asOf, -4) },
    { key: "xc60-13", year: 2019, mileageKm: 84_100, ask: 266_500_00n, prevAsk: 274_000_00n, listedOn: addDays(asOf, -48) },
    { key: "xc60-14", year: 2019, mileageKm: 77_900, ask: 273_000_00n, listedOn: addDays(asOf, -25) },
    { key: "xc60-15", year: 2018, mileageKm: 90_500, ask: 251_000_00n, listedOn: addDays(asOf, -60), removedOn: addDays(asOf, -20) },
    { key: "xc60-16", year: 2020, mileageKm: 63_700, ask: 299_000_00n, listedOn: addDays(asOf, -11) },
    { key: "xc60-17", year: 2019, mileageKm: 80_200, ask: 270_000_00n, listedOn: addDays(asOf, -17) },
    { key: "xc60-18", year: 2019, mileageKm: 78_500, ask: 276_000_00n, listedOn: addDays(asOf, -9) },
  ];

  await db.insert(vehicleMarketListings).values(
    listingSpecs.map((l) => ({
      householdId: input.householdId,
      subjectVehicleId: subjectId,
      externalKey: l.key,
      make: "Volvo",
      model: "XC60",
      variant: l.variant ?? "D4 AWD",
      modelYear: l.year,
      fuelType: l.fuel ?? "diesel",
      drivetrain: "AWD",
      transmission: "automatic",
      mileageKm: l.mileageKm,
      region: "Stockholm",
      askPriceMinor: l.ask,
      previousAskPriceMinor: l.prevAsk,
      priceKind: "ASKING_PRICE" as const,
      listedOn: l.listedOn,
      removedOn: l.removedOn,
      equipment: ["navigation", "heated_seats", "parking_sensors"],
    })),
  );

  const historyPoints = [
    { asOf, median: 272_000_00n, count: 14, age: 24, reduction: "0.1800" },
    { asOf: addDays(asOf, -30), median: 275_000_00n, count: 13, age: 26, reduction: "0.1500" },
    { asOf: addDays(asOf, -90), median: 281_000_00n, count: 12, age: 31, reduction: "0.1200" },
    { asOf: addDays(asOf, -182), median: 288_000_00n, count: 11, age: 35, reduction: "0.0900" },
    { asOf: addDays(asOf, -365), median: 298_000_00n, count: 10, age: 38, reduction: "0.0600" },
  ];

  await db.insert(vehicleMarketHistoryPoints).values(
    historyPoints.map((h) => ({
      householdId: input.householdId,
      subjectVehicleId: subjectId,
      asOf: h.asOf,
      medianAskingPriceMinor: h.median,
      listingCount: h.count,
      medianListingAgeDays: h.age,
      priceReductionRate: h.reduction,
    })),
  );

  await db.insert(vehicleHouseholdRequirements).values({
    householdId: input.householdId,
    seatsRequired: 5,
    isofixRequired: 2,
    cargoRequired: true,
    towingRequired: false,
    homeChargingAvailable: false,
    minRangeKm: 300,
    annualMileageKm: 16_500,
  });

  const candidateRows = await db
    .insert(vehicleCandidates)
    .values([
      {
        householdId: input.householdId,
        name: "Volvo XC40 Recharge",
        make: "Volvo",
        model: "XC40",
        modelYear: 2022,
        variant: "Twin Motor",
        fuelType: "electric",
        mileageKm: 28_000,
        askPriceMinor: 389_000_00n,
        estimatedMonthlyEconomicMinor: 4_100_00n,
        seats: 5,
        isofixCount: 2,
        cargoOk: true,
        towingOk: false,
        isElectric: true,
        rangeKm: 420,
        financingDownPaymentMinor: 80_000_00n,
        financingMonthlyMinor: 4_800_00n,
        expectedValuationMidMinor: 320_000_00n,
        insuranceMonthlyMinor: 650_00n,
        taxAnnualMinor: 360_00n,
        energyMonthlyMinor: 850_00n,
        serviceReserveMonthlyMinor: 350_00n,
        repairReserveMonthlyMinor: 200_00n,
        holdingPeriodMonths: 36,
        notes: "El — lägre drift men kräver hemladdning (saknas)",
      },
      {
        householdId: input.householdId,
        name: "Kia Sorento PHEV",
        make: "Kia",
        model: "Sorento",
        modelYear: 2021,
        variant: "AWD",
        fuelType: "hybrid",
        mileageKm: 42_000,
        askPriceMinor: 359_000_00n,
        estimatedMonthlyEconomicMinor: 4_650_00n,
        seats: 7,
        isofixCount: 3,
        cargoOk: true,
        towingOk: true,
        isElectric: false,
        rangeKm: 55,
        financingDownPaymentMinor: 70_000_00n,
        financingMonthlyMinor: 4_200_00n,
        expectedValuationMidMinor: 290_000_00n,
        insuranceMonthlyMinor: 720_00n,
        taxAnnualMinor: 360_00n,
        energyMonthlyMinor: 1_100_00n,
        serviceReserveMonthlyMinor: 400_00n,
        repairReserveMonthlyMinor: 250_00n,
        holdingPeriodMonths: 36,
        notes: "7 säten — passar familj + last",
      },
      {
        householdId: input.householdId,
        name: "Toyota RAV4 Hybrid",
        make: "Toyota",
        model: "RAV4",
        modelYear: 2021,
        fuelType: "hybrid",
        mileageKm: 48_000,
        askPriceMinor: 329_000_00n,
        estimatedMonthlyEconomicMinor: 4_900_00n,
        seats: 5,
        isofixCount: 2,
        cargoOk: true,
        towingOk: false,
        isElectric: false,
        rangeKm: null,
        financingDownPaymentMinor: 60_000_00n,
        financingMonthlyMinor: 3_900_00n,
        expectedValuationMidMinor: 270_000_00n,
        holdingPeriodMonths: 36,
        notes: "Lägre drivmedel, högre pris",
      },
    ])
    .returning();

  const leaseCandidate =
    candidateRows.find((c) => c.name === "Kia Sorento PHEV") ?? candidateRows[0]!;

  await db.insert(vehicleLeaseAgreements).values({
    householdId: input.householdId,
    candidateId: leaseCandidate.id,
    name: `Privatleasing ${leaseCandidate.name}`,
    initialFeeMinor: 25_000_00n,
    monthlyPaymentMinor: 5_490_00n,
    termMonths: 36,
    allowedMileageKm: 45_000,
    startOn: addDays(asOf, -8),
    endOn: addDays(asOf, 36 * 30 - 8),
    startMileageKm: 0,
    currentMileageKm: 0,
    excessPriceMinorPerKm: 180n,
    serviceIncluded: true,
    insuranceIncluded: true,
    tiresIncluded: true,
    expectedReturnCostMinor: 8_500_00n,
  });
}
