import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessHouseholdFit,
  computePurchaseWindow,
  computeSellWindow,
  evaluateRequirementsAgainstCandidate,
  horizonOwnershipCost,
  recommendVehicleAction,
  repairAndKeep,
  replaceIncremental,
  sellNow,
} from "./decisions";
import { calculateLeaseEconomics, compareAcquisitionModes } from "./leasing";

test("MUST_HAVE failure blocks primary recommendation", () => {
  const reqs = evaluateRequirementsAgainstCandidate({
    seatsRequired: 7,
    isofixRequired: 2,
    cargoRequired: true,
    towingRequired: false,
    homeChargingAvailable: false,
    minRangeKm: 400,
    annualMileageKm: 16000,
    candidate: {
      seats: 5,
      isofixCount: 2,
      cargoOk: true,
      towingOk: false,
      isElectric: true,
      rangeKm: 450,
      suitableAnnualKm: 20000,
    },
  });
  const fit = assessHouseholdFit(reqs);
  assert.equal(fit.eligibleForPrimaryRecommendation, false);
  assert.ok(fit.mustHaveFailures.length >= 1);
});

test("same-horizon keep vs replace and cash distinction", () => {
  const keep = horizonOwnershipCost({
    monthlyEconomicMinor: 5_500_00n,
    horizonMonths: 36,
  });
  const cand = horizonOwnershipCost({
    monthlyEconomicMinor: 4_200_00n,
    horizonMonths: 36,
  });
  assert.equal(keep.horizonMonths, cand.horizonMonths);
  const incr = replaceIncremental({
    keepTotalEconomicMinor: keep.totalEconomicMinor,
    candidateTotalEconomicMinor: cand.totalEconomicMinor,
    cashRequiredTodayMinor: 85_000_00n,
    horizonMonths: 36,
  });
  assert.ok(incr.economicDeltaMinor < 0n);
  assert.equal(incr.cashRequiredTodayMinor, 85_000_00n);
  assert.ok(incr.summary.includes("kontant"));
});

test("repair and keep vs replace", () => {
  const result = repairAndKeep({
    repairCostMinor: 25_000_00n,
    additionalHorizonMonths: 24,
    monthlyEconomicAfterRepairMinor: 5_000_00n,
    replaceHorizonMonths: 36,
    replaceTotalEconomicMinor: 300_000_00n,
    replaceCashRequiredTodayMinor: 90_000_00n,
  });
  assert.ok(
    ["REPAIR_AND_KEEP", "REPLACE_WITH_CANDIDATE", "NO_CLEAR_ADVANTAGE"].includes(
      result.recommendation,
    ),
  );
  assert.ok(result.assumptions.some((a) => a.includes("Same ownership horizon")));
});

test("sell now detects negative equity", () => {
  const neg = sellNow({
    estimatedValueMidMinor: 180_000_00n,
    sellingCostMinor: 10_000_00n,
    remainingDebtMinor: 195_000_00n,
  });
  assert.equal(neg.negativeEquity, true);
  assert.ok(neg.negativeEquityMinor > 0n);

  const pos = sellNow({
    estimatedValueMidMinor: 280_000_00n,
    sellingCostMinor: 8_000_00n,
    remainingDebtMinor: 195_000_00n,
  });
  assert.equal(pos.negativeEquity, false);
});

test("sell and purchase windows insufficient-data safe", () => {
  const sell = computeSellWindow({
    equityMinor: -10_000_00n,
    monthsToBindingEnd: 12,
    medianListingAgeDays: 40,
    liquidityLabel: "moderate",
    nextServiceOn: "2026-10-01",
    warrantyEndsOn: null,
    asOf: "2026-08-01",
    annualKm: 16500,
    currentOdometerKm: 72000,
    valuationLowMinor: 250_000_00n,
    valuationHighMinor: 300_000_00n,
  });
  assert.equal(sell.status, "WAIT");
  assert.ok(!sell.summary.includes("exakt datum"));

  const purchase = computePurchaseWindow({
    compsModelYears: [],
    compsMileages: [],
    holdingPeriodMonths: 36,
    annualKm: 15000,
  });
  assert.equal(purchase.insufficientData, true);
});

test("lease mileage excess and acquisition modes", () => {
  const lease = calculateLeaseEconomics(
    {
      initialFeeMinor: 15_000_00n,
      monthlyPaymentMinor: 4_500_00n,
      termMonths: 36,
      allowedMileageKm: 45_000,
      startOn: "2024-08-01",
      endOn: "2027-08-01",
      currentMileageKm: 38_000,
      projectedAnnualKm: 18_000,
      excessMileagePriceMinorPerKm: 1_50n,
      serviceIncluded: true,
      insuranceIncluded: false,
      tiresIncluded: false,
      expectedReturnCostMinor: 5_000_00n,
    },
    "2026-08-01",
  );
  assert.ok(lease.expectedExcessMileageKm >= 0);
  assert.ok(
    lease.expectedExcessChargeHighMinor >= lease.expectedExcessChargeLowMinor,
  );

  const modes = compareAcquisitionModes({
    horizonMonths: 36,
    cashPurchase: {
      purchasePriceMinor: 350_000_00n,
      expectedSaleValueMinor: 220_000_00n,
      ownershipEconomicMinor: 180_000_00n,
    },
    financedPurchase: {
      downPaymentMinor: 70_000_00n,
      totalInterestMinor: 40_000_00n,
      ownershipEconomicMinor: 200_000_00n,
      expectedSaleValueMinor: 220_000_00n,
      endingDebtMinor: 80_000_00n,
    },
    privateLease: {
      totalLeaseCashMinor: lease.totalExpectedLeaseCashMinor,
      ownershipEconomicMinor: lease.totalExpectedLeaseCashMinor,
    },
  });
  assert.equal(modes.rows.length, 3);
});

test("recommendation rejects cheaper MUST_HAVE failure", () => {
  const rec = recommendVehicleAction({
    sellStatus: "WATCH",
    bestCandidate: {
      id: "c1",
      name: "Cheap 5-seater",
      economicDeltaMinor: -50_000_00n,
      cashRequiredTodayMinor: 20_000_00n,
      fitEligible: false,
    },
    repair: null,
    negativeEquity: false,
  });
  assert.equal(rec.kind, "KEEP");
  assert.ok(rec.householdFit.includes("MUST_HAVE"));
});
