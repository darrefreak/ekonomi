import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeLiquidityProxy,
  computeMarketStats,
  computeMarketTrend,
  filterOutliers,
  mileagePriceSlopeMinorPerKm,
  modelYearPriceSlopeMinorPerYear,
  selectComparables,
  valuationFromComparables,
  type MarketListing,
} from "./market-analytics";

function listing(
  partial: Partial<MarketListing> & Pick<MarketListing, "id" | "askPriceMinor" | "mileageKm" | "modelYear">,
): MarketListing {
  return {
    make: "Volvo",
    model: "XC60",
    variant: "D4",
    fuelType: "diesel",
    drivetrain: "awd",
    transmission: "auto",
    region: "Stockholm",
    priceKind: "ASKING_PRICE",
    listedOn: "2026-06-01",
    removedOn: null,
    previousAskPriceMinor: null,
    ...partial,
  };
}

const baseListings: MarketListing[] = [
  listing({ id: "1", askPriceMinor: 270_000_00n, mileageKm: 60_000, modelYear: 2019 }),
  listing({ id: "2", askPriceMinor: 275_000_00n, mileageKm: 62_000, modelYear: 2019 }),
  listing({ id: "3", askPriceMinor: 280_000_00n, mileageKm: 65_000, modelYear: 2019 }),
  listing({ id: "4", askPriceMinor: 285_000_00n, mileageKm: 70_000, modelYear: 2018 }),
  listing({ id: "5", askPriceMinor: 290_000_00n, mileageKm: 55_000, modelYear: 2020 }),
  listing({ id: "6", askPriceMinor: 295_000_00n, mileageKm: 58_000, modelYear: 2020 }),
  listing({ id: "7", askPriceMinor: 300_000_00n, mileageKm: 50_000, modelYear: 2020 }),
  listing({ id: "8", askPriceMinor: 265_000_00n, mileageKm: 75_000, modelYear: 2018 }),
  listing({
    id: "outlier",
    askPriceMinor: 900_000_00n,
    mileageKm: 10_000,
    modelYear: 2019,
  }),
  listing({
    id: "unrelated",
    make: "Toyota",
    model: "RAV4",
    askPriceMinor: 320_000_00n,
    mileageKm: 40_000,
    modelYear: 2021,
  }),
];

test("comparable selection ignores unrelated make/model and widens levels", () => {
  const subject = {
    make: "Volvo",
    model: "XC60",
    variant: "D4",
    modelYear: 2019,
    fuelType: "diesel",
    drivetrain: "awd",
    mileageKm: 62_000,
  };
  const sel = selectComparables(subject, baseListings, "2026-08-01");
  assert.ok(sel.comparableCount >= 5);
  assert.ok(sel.selectionLevel >= 1);
  assert.ok(!sel.comparables.some((c) => c.make === "Toyota"));
  assert.ok(sel.confidence > 0);
});

test("insufficient data returns level 0", () => {
  const sel = selectComparables(
    {
      make: "Koenigsegg",
      model: "Jesko",
      modelYear: 2022,
      fuelType: "petrol",
      mileageKm: 1000,
    },
    baseListings,
    "2026-08-01",
  );
  assert.equal(sel.selectionLevel, 0);
  assert.equal(sel.comparableCount, 0);
});

test("stats median quartiles and outlier handling", () => {
  const volvo = baseListings.filter((l) => l.make === "Volvo");
  const filtered = filterOutliers(volvo);
  assert.ok(!filtered.some((l) => l.id === "outlier"));
  const stats = computeMarketStats(volvo);
  assert.ok(stats.medianAskingPriceMinor != null);
  assert.ok(stats.lowerQuartileMinor != null);
  assert.ok(stats.upperQuartileMinor != null);
  assert.ok(stats.lowerQuartileMinor! <= stats.medianAskingPriceMinor!);
  assert.ok(stats.medianAskingPriceMinor! <= stats.upperQuartileMinor!);
  assert.equal(stats.priceKindLabel, "ASKING_PRICE_ONLY");
});

test("valuation range rounded and insufficient-data safe", () => {
  const sel = selectComparables(
    {
      make: "Volvo",
      model: "XC60",
      modelYear: 2019,
      fuelType: "diesel",
      mileageKm: 62_000,
    },
    baseListings,
    "2026-08-01",
  );
  const stats = computeMarketStats(sel.comparables);
  const val = valuationFromComparables({
    stats,
    selectionConfidence: sel.confidence,
    asOf: "2026-08-01",
    remainingDebtMinor: 195_000_00n,
  });
  assert.equal(val.insufficientData, false);
  assert.ok(val.estimatedMidMinor != null);
  assert.equal(val.estimatedMidMinor! % 5_000_00n, 0n);
  assert.ok(val.assumptions.some((a) => a.includes("ASKING")));

  const empty = valuationFromComparables({
    stats: computeMarketStats([]),
    selectionConfidence: 0,
    asOf: "2026-08-01",
  });
  assert.equal(empty.insufficientData, true);
});

test("mileage and model-year slopes", () => {
  const volvo = baseListings.filter((l) => l.make === "Volvo" && l.id !== "outlier");
  const mileSlope = mileagePriceSlopeMinorPerKm(volvo);
  const yearSlope = modelYearPriceSlopeMinorPerYear(volvo);
  assert.ok(mileSlope != null);
  assert.ok(yearSlope != null);
  // Higher mileage → lower price (negative slope)
  assert.ok(mileSlope! < 0n);
  // Newer year → higher price
  assert.ok(yearSlope! > 0n);
});

test("market trend and liquidity proxy", () => {
  const points = [
    {
      asOf: "2025-08-01",
      medianAskingPriceMinor: 300_000_00n,
      listingCount: 20,
      medianListingAgeDays: 40,
      priceReductionRate: 0.2,
    },
    {
      asOf: "2026-05-01",
      medianAskingPriceMinor: 285_000_00n,
      listingCount: 16,
      medianListingAgeDays: 35,
      priceReductionRate: 0.25,
    },
    {
      asOf: "2026-08-01",
      medianAskingPriceMinor: 280_000_00n,
      listingCount: 14,
      medianListingAgeDays: 30,
      priceReductionRate: 0.3,
    },
  ];
  const trend = computeMarketTrend(points, "2026-08-01");
  assert.equal(trend.insufficientHistory, false);
  assert.ok(trend.d90 != null);
  assert.ok(trend.d90!.medianAskingChangeMinor! < 0n);

  const liq = computeLiquidityProxy({
    activeComparableCount: 14,
    medianListingAgeDays: 30,
    removedLast90d: 6,
    newListingsLast30d: 4,
    priceReductionRate: 0.3,
  });
  assert.ok(["low", "moderate", "high"].includes(liq.label));
  assert.ok(liq.caveats.some((c) => c.includes("≠ sold")));
});
