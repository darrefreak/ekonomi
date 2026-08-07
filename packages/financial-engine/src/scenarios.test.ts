import assert from "node:assert/strict";
import { test } from "node:test";
import { backtestLinearForecast } from "./backtest";
import { FORECAST_HORIZONS } from "./forecast";
import { parseScenarioAssumptions, simulateScenario } from "./scenarios";

test("FORECAST_HORIZONS covers 7d through 12m", () => {
  assert.deepEqual(
    FORECAST_HORIZONS.map((h) => h.label),
    ["7d", "30d", "60d", "90d", "6m", "12m"],
  );
});

test("simulateScenario is non-destructive pure projection", () => {
  const baseline = {
    startingCashMinor: 200_000_00n,
    startingNetWorthMinor: 1_000_000_00n,
    monthlyNetSavingsMinor: 20_000_00n,
    asOf: "2026-08-01",
  };
  const sim = simulateScenario({
    baseline,
    assumptions: {
      monthlyIncomeDeltaMinor: -10_000_00n,
      monthlyExpenseDeltaMinor: 2_000_00n,
      oneTimeCashDeltaMinor: 50_000_00n,
    },
  });
  assert.equal(sim.adjustedMonthlySavingsMinor, 8_000_00n);
  assert.equal(sim.projectedMonthlyDeltaMinor, -12_000_00n);
  assert.equal(sim.startingCashMinor, 250_000_00n);
  assert.equal(baseline.startingCashMinor, 200_000_00n);
  assert.equal(sim.points.length, 6);
});

test("simulateScenario applies mortgageRateDeltaBps via mortgage context", () => {
  const sim = simulateScenario({
    baseline: {
      startingCashMinor: 200_000_00n,
      startingNetWorthMinor: 1_000_000_00n,
      monthlyNetSavingsMinor: 20_000_00n,
      asOf: "2026-08-01",
    },
    assumptions: { mortgageRateDeltaBps: 100 },
    mortgage: {
      principalMinor: 3_900_000_00n,
      currentAnnualRateBps: 240,
    },
  });
  assert.ok(sim.mortgageRateExpenseDeltaMinor > 0n);
  assert.equal(
    sim.adjustedMonthlySavingsMinor,
    20_000_00n - sim.mortgageRateExpenseDeltaMinor,
  );
});

test("parseScenarioAssumptions accepts string minors", () => {
  const a = parseScenarioAssumptions({
    monthlyIncomeDeltaMinor: "-500000",
    oneTimeCashDeltaMinor: "1000000",
  });
  assert.equal(a.monthlyIncomeDeltaMinor, -5_000_00n);
  assert.equal(a.oneTimeCashDeltaMinor, 10_000_00n);
});

test("backtestLinearForecast compares matured horizons", () => {
  const result = backtestLinearForecast({
    asOf: "2026-08-01",
    actualCashMinor: 300_000_00n,
    actualNetWorthMinor: 1_200_000_00n,
    monthlyNetSavingsMinor: 30_000_00n,
    lookbackDays: 30,
  });
  assert.equal(result.pastAsOf, "2026-07-02");
  assert.ok(result.comparisons.length >= 1);
  assert.ok(result.comparisons.some((c) => c.label === "7d"));
  assert.ok(result.comparisons.some((c) => c.label === "30d"));
  assert.ok(result.metrics.every((m) => m.sampleCount === 1));
});
