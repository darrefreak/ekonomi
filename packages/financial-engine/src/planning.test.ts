import assert from "node:assert/strict";
import { test } from "node:test";
import {
  annualizeSubscription,
  goalProgress,
  requiredMonthlyContribution,
  rollupActualByBudgetKey,
  summarizeBudget,
} from "./planning";

test("budget remaining and utilization", () => {
  const summary = summarizeBudget([
    { categoryKey: "food", plannedMinor: 8_000_00n, actualMinor: 6_500_00n },
    { categoryKey: "lifestyle", plannedMinor: 2_000_00n, actualMinor: 2_500_00n },
  ]);
  assert.equal(summary.plannedMinor, 10_000_00n);
  assert.equal(summary.actualMinor, 9_000_00n);
  assert.equal(summary.remainingMinor, 1_000_00n);
  assert.equal(summary.lines[0]!.utilizationPercent, 81.25);
  assert.equal(summary.lines[1]!.varianceMinor, 500_00n);
});

test("rollup leaf spend into parent budget keys", () => {
  const map = rollupActualByBudgetKey(
    [
      { categoryKey: "food.groceries", amountMinor: 1_000_00n },
      { categoryKey: "food.restaurant", amountMinor: 400_00n },
      { categoryKey: "lifestyle.subscriptions", amountMinor: 149_00n },
    ],
    ["food", "lifestyle", "transport"],
  );
  assert.equal(map.get("food"), 1_400_00n);
  assert.equal(map.get("lifestyle"), 149_00n);
  assert.equal(map.get("transport"), 0n);
});

test("goal progress and required monthly contribution", () => {
  const progress = goalProgress(40_000_00n, 100_000_00n);
  assert.equal(progress.remainingMinor, 60_000_00n);
  assert.equal(progress.percentComplete, 40);
  const monthly = requiredMonthlyContribution(40_000_00n, 100_000_00n, 6);
  assert.equal(monthly, 10_000_00n);
});

test("annualize subscription cadences", () => {
  assert.equal(annualizeSubscription(149_00n, "MONTHLY"), 1_788_00n);
  assert.equal(annualizeSubscription(1_200_00n, "YEARLY"), 1_200_00n);
  assert.equal(annualizeSubscription(50_00n, "WEEKLY"), 2_600_00n);
});
