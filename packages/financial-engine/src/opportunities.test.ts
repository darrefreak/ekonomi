import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateLifestyleCreep } from "./lifestyle-creep";
import {
  detectBudgetOverrunOpportunity,
  detectCashSurplusOpportunity,
  detectContractRenewalOpportunity,
  detectMortgageRateOpportunity,
  detectSpendingTrendOpportunity,
  detectSubscriptionPriceIncrease,
  detectVehicleReplacementOpportunity,
  rankOpportunities,
  OPPORTUNITY_THRESHOLDS,
} from "./opportunities";

test("mortgage scenario impact is principal × rate delta (not 10% heuristic)", () => {
  const m = detectMortgageRateOpportunity({
    asOf: "2026-08-01",
    principalMinor: 3_200_000_00n,
    currentAnnualRateBps: 425,
    scenarioCutBps: 25,
    mortgageAccountId: "acc-1",
  });
  assert.ok(m);
  assert.equal(m!.type, "MORTGAGE_RATE");
  assert.ok((m!.estimatedAnnualImpactMinor ?? 0n) > 0n);
  assert.ok(!m!.estimateBasis.toLowerCase().includes("heuristik"));
  assert.ok(m!.estimateBasis.toLowerCase().includes("scenario"));
  assert.ok(m!.facts.some((f) => f.key === "grossAnnualDiff"));
  // ≈ 3.2 Mkr × 0.25% ≈ 8 000 kr/year (integer öre rounding via monthly×12)
  const annual = m!.estimatedAnnualImpactMinor!;
  assert.ok(annual >= 7_990_00n && annual <= 8_010_00n);
});

test("subscription price increase from series", () => {
  const s = detectSubscriptionPriceIncrease({
    asOf: "2026-08-01",
    subscriptionId: "sub-1",
    name: "Netflix",
    monthlyAmountSeries: [179_00n, 199_00n, 219_00n],
  });
  assert.ok(s);
  assert.equal(s!.estimatedMonthlyImpactMinor, 20_00n);
  assert.equal(s!.estimatedAnnualImpactMinor, 240_00n);

  // Below both absolute (10 kr) and percent (3%) thresholds
  const tiny = detectSubscriptionPriceIncrease({
    asOf: "2026-08-01",
    subscriptionId: "sub-3",
    name: "Tiny2",
    monthlyAmountSeries: [100_00n, 102_00n],
  });
  assert.equal(tiny, null);
});

test("cash surplus uses available_to_invest engine", () => {
  const c = detectCashSurplusOpportunity({
    asOf: "2026-08-01",
    availableCashMinor: 200_000_00n,
    minimumCashBalanceMinor: 20_000_00n,
    emergencyFundTargetMinor: 50_000_00n,
    safetyMarginMinor: 10_000_00n,
    reservedSinkingFundMinor: 5_000_00n,
    upcoming30dOutflowMinor: 15_000_00n,
  });
  assert.ok(c);
  assert.equal(c!.estimatedMonthlyImpactMinor, 100_000_00n);
  assert.equal(c!.estimatedAnnualImpactMinor, null);
});

test("budget overrun respects period progress", () => {
  const early = detectBudgetOverrunOpportunity({
    asOf: "2026-08-01",
    plannedMinor: 20_000_00n,
    actualMinor: 5_000_00n,
    periodProgress: 0.1,
    forecastRemainingSpendMinor: 25_000_00n,
  });
  assert.equal(early, null);

  const late = detectBudgetOverrunOpportunity({
    asOf: "2026-08-01",
    plannedMinor: 20_000_00n,
    actualMinor: 15_000_00n,
    periodProgress: 0.7,
    forecastRemainingSpendMinor: 12_000_00n,
  });
  assert.ok(late);
  assert.equal(late!.estimatedAnnualImpactMinor, 7_000_00n);
});

test("spending trend from lifestyle creep", () => {
  const creep = calculateLifestyleCreep({
    asOf: "2026-08-01",
    monthlyPoints: [
      ...Array.from({ length: 12 }, (_, i) => ({
        month: `2025-${String(i + 1).padStart(2, "0")}`,
        spendingMinor: 30_000_00n,
      })),
      { month: "2026-05", spendingMinor: 40_000_00n },
      { month: "2026-06", spendingMinor: 40_000_00n },
      { month: "2026-07", spendingMinor: 40_000_00n },
    ],
  });
  const opp = detectSpendingTrendOpportunity(creep, "2026-08-01");
  assert.ok(opp);
  assert.equal(opp!.type, "SPENDING_TREND");
});

test("contract renewal has null impact (no fake savings)", () => {
  const items = detectContractRenewalOpportunity({
    asOf: "2026-08-01",
    contracts: [
      {
        id: "c1",
        name: "El",
        provider: "Vattenfall",
        renewalDate: "2026-09-15",
        endDate: null,
        cancellationDeadline: "2026-09-01",
        monthlyCostMinor: 1_450_00n,
        annualCostMinor: 17_400_00n,
        status: "ACTIVE",
      },
    ],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0]!.estimatedAnnualImpactMinor, null);
  assert.ok(items[0]!.estimateBasis.includes("Ingen besparing"));
});

test("vehicle replacement only when recommendation=replace", () => {
  const keep = detectVehicleReplacementOpportunity({
    asOf: "2026-08-01",
    vehicleId: "v1",
    name: "Bil",
    recommendation: "keep",
    monthlyDeltaMinor: -1_000_00n,
    analysisSource: "live_over_mock_listings",
    confidence: 0.7,
  });
  assert.equal(keep, null);

  const rep = detectVehicleReplacementOpportunity({
    asOf: "2026-08-01",
    vehicleId: "v1",
    name: "Bil",
    recommendation: "replace",
    monthlyDeltaMinor: -1_000_00n,
    analysisSource: "live_over_mock_listings",
    confidence: 0.7,
  });
  assert.ok(rep);
  assert.ok(rep!.assumptions.some((a) => a.includes("MOCK")));
});

test("priority ordering prefers higher impact×confidence", () => {
  const mortgage = detectMortgageRateOpportunity({
    asOf: "2026-08-01",
    principalMinor: 3_200_000_00n,
    currentAnnualRateBps: 425,
    mortgageAccountId: "m1",
  });
  const sub = detectSubscriptionPriceIncrease({
    asOf: "2026-08-01",
    subscriptionId: "s1",
    name: "Netflix",
    monthlyAmountSeries: [179_00n, 199_00n, 219_00n],
  });
  const ranked = rankOpportunities([sub, mortgage]);
  assert.ok(ranked.length >= 2);
  assert.ok(
    ranked[0]!.priority.priorityScore >= ranked[1]!.priority.priorityScore,
  );
  assert.ok(OPPORTUNITY_THRESHOLDS.mortgageScenarioCutBps === 25);
});
