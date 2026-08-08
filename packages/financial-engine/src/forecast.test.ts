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

test("savings optimizer passes through deterministic opportunity impacts", () => {
  const items = savingsOptimizerSuggestions({
    items: [
      {
        id: "mortgage-rate",
        title: "Granska bolåneränta (scenario)",
        estimatedAnnualSavingMinor: 8_000_00n,
        effort: "medium",
        estimateBasis: "scenario",
      },
      {
        id: "zero",
        title: "Skip",
        estimatedAnnualSavingMinor: 0n,
        effort: "low",
      },
    ],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, "mortgage-rate");
});

test("health level bands", () => {
  assert.equal(healthLevelFromScore(85), "LOW");
  assert.equal(healthLevelFromScore(45), "HIGH");
});
