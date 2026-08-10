import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attributeNetWorthChange,
  forecastCashflowDeltas,
} from "@ffos/financial-engine";

test("dashboard and net-worth share attribution definition", () => {
  const totals = {
    incomeMinor: 82_050_00n,
    spendingMinor: 54_100_00n,
    netWorthDeltaMinor: 27_950_00n,
    debtReductionMinor: 10_000_00n,
  };
  const a = attributeNetWorthChange(totals);
  const b = attributeNetWorthChange(totals);
  assert.equal(a.changeMonthMinor, b.changeMonthMinor);
  assert.deepEqual(a.attribution, b.attribution);
  assert.equal(a.changeMonthMinor, totals.netWorthDeltaMinor);
});

test("forecast deltas are deterministic from savings", () => {
  const d1 = forecastCashflowDeltas({
    startingCashMinor: 250_000_00n,
    startingNetWorthMinor: 4_800_000_00n,
    monthlyNetSavingsMinor: 28_000_00n,
    asOf: "2026-08-01",
  });
  const d2 = forecastCashflowDeltas({
    startingCashMinor: 250_000_00n,
    startingNetWorthMinor: 4_800_000_00n,
    monthlyNetSavingsMinor: 28_000_00n,
    asOf: "2026-08-01",
  });
  assert.deepEqual(d1, d2);
  assert.notEqual(d1.days30, 18_400_00n);
});
