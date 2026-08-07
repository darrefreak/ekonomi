import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMonthlyCashflow,
  comparePeriods,
  summarizePeriod,
} from "./cashflow";

test("monthly cashflow and period comparison", () => {
  const points = buildMonthlyCashflow(["2026-06", "2026-07"], {
    "2026-06": { incomeMinor: 80_000_00n, spendingMinor: 50_000_00n },
    "2026-07": { incomeMinor: 82_000_00n, spendingMinor: 55_000_00n },
  });
  assert.equal(points[1]!.savingsMinor, 27_000_00n);
  const summary = summarizePeriod(points);
  assert.equal(summary.incomeMinor, 162_000_00n);
  const cmp = comparePeriods(
    { incomeMinor: 82_000_00n, spendingMinor: 55_000_00n, savingsMinor: 27_000_00n },
    { incomeMinor: 80_000_00n, spendingMinor: 50_000_00n, savingsMinor: 30_000_00n },
  );
  assert.equal(cmp.spendingDeltaMinor, 5_000_00n);
  assert.equal(cmp.spendingDeltaPercent, 10);
});
