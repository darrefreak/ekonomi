import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attributeNetWorthChange,
  cashRunwayMonths,
  forecastCashflowDeltas,
} from "./period-metrics";

test("attributeNetWorthChange uses event NW delta", () => {
  const { changeMonthMinor, attribution } = attributeNetWorthChange({
    incomeMinor: 80_000_00n,
    spendingMinor: 50_000_00n,
    netWorthDeltaMinor: 28_000_00n,
    debtReductionMinor: 10_000_00n,
  });
  assert.equal(changeMonthMinor, 28_000_00n);
  assert.equal(attribution[0]!.amountMinor, 30_000_00n);
  assert.ok(attribution.some((a) => a.key === "debt_reduction"));
  assert.ok(attribution.some((a) => a.key === "other"));
});

test("forecastCashflowDeltas are relative to starting cash", () => {
  const deltas = forecastCashflowDeltas({
    startingCashMinor: 200_000_00n,
    startingNetWorthMinor: 1_000_000_00n,
    monthlyNetSavingsMinor: 30_000_00n,
    asOf: "2026-08-01",
  });
  assert.ok(deltas.days30 > 0n);
  assert.ok(deltas.days60 > deltas.days30);
});

test("cashRunwayMonths", () => {
  assert.ok(cashRunwayMonths({
    availableCashMinor: 120_000_00n,
    monthlySpendingMinor: 40_000_00n,
  }) === 3);
});
