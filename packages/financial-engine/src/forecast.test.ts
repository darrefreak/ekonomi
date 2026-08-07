import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildForecastPoints,
  healthLevelFromScore,
  savingsOptimizerSuggestions,
} from "./forecast";

test("forecast points grow with savings", () => {
  const points = buildForecastPoints({
    startingCashMinor: 100_000_00n,
    startingNetWorthMinor: 500_000_00n,
    monthlyNetSavingsMinor: 30_000_00n,
    asOf: "2026-08-01",
  });
  assert.equal(points.length, 6);
  assert.ok(points[5]!.projectedCashMinor > points[0]!.projectedCashMinor);
});

test("savings optimizer emits mortgage and subscription ideas", () => {
  const items = savingsOptimizerSuggestions({
    subscriptionAnnualMinor: 3_000_00n,
    mortgageInterestAnnualMinor: 50_000_00n,
    lifestyleOverBudgetMinor: 1_000_00n,
  });
  const mortgage = items.find((i) => i.id === "rate-negotiate");
  assert.ok(mortgage);
  assert.equal(mortgage!.estimatedAnnualSavingMinor, 5_000_00n);
  assert.ok(items.some((i) => i.id === "subs-trim"));
});

test("health level bands", () => {
  assert.equal(healthLevelFromScore(85), "LOW");
  assert.equal(healthLevelFromScore(45), "HIGH");
});
