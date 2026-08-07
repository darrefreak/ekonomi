import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateLifestyleCreep } from "./lifestyle-creep";

test("calculateLifestyleCreep flags elevated recent spend", () => {
  const months: Array<{ month: string; spendingMinor: bigint }> = [];
  for (let i = 1; i <= 12; i += 1) {
    months.push({
      month: `2025-${String(i).padStart(2, "0")}`,
      spendingMinor: 40_000_00n,
    });
  }
  for (const m of ["2026-05", "2026-06", "2026-07"]) {
    months.push({ month: m, spendingMinor: 50_000_00n });
  }
  const creep = calculateLifestyleCreep({
    monthlyPoints: months,
    asOf: "2026-08-01",
    categorySpends: [
      {
        categoryKey: "food.groceries",
        categoryName: "Mat",
        recentMinor: 12_000_00n,
        baselineMinor: 9_000_00n,
      },
    ],
  });
  assert.equal(creep.creeping, true);
  assert.ok((creep.deltaPercent ?? 0) >= 8);
  assert.equal(creep.drivers[0]?.categoryKey, "food.groceries");
});

test("calculateLifestyleCreep is quiet when flat", () => {
  const months = Array.from({ length: 15 }, (_, i) => ({
    month: `2025-${String((i % 12) + 1).padStart(2, "0")}`,
    spendingMinor: 40_000_00n,
  }));
  const creep = calculateLifestyleCreep({
    monthlyPoints: months,
    asOf: "2026-08-01",
  });
  assert.equal(creep.creeping, false);
});
