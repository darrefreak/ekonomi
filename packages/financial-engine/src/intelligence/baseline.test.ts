import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateAllBaselines,
  calculateCategoryTrend,
  calculateChangeDrivers,
  calculateMerchantAnalytics,
  calculateNormalisedSpending,
  calculateSpendingBaseline,
  comparePeriodDrivers,
} from "./baseline";

/** n months of the same amount, ending at 2026-08. */
function flatMonths(count: number, amountMinor: bigint) {
  return Array.from({ length: count }, (_, index) => {
    const monthsBack = count - 1 - index;
    const zeroBased = 2026 * 12 + 7 - monthsBack;
    return {
      month: `${Math.floor(zeroBased / 12)}-${String((zeroBased % 12) + 1).padStart(2, "0")}`,
      amountMinor,
    };
  });
}

describe("spending baselines", () => {
  it("reports the level the household normally lives at, not the mean", () => {
    const months = [
      ...flatMonths(11, 5_000_000n).slice(0, 11),
      { month: "2026-08", amountMinor: 45_000_000n }, // one enormous month
    ];
    const baseline = calculateSpendingBaseline({ monthlyTotals: months, window: "12m" });
    assert.equal(baseline.medianMinor, 5_000_000n, "the outlier does not move the normal level");
    // The mean is 8 333 333 — two thirds above a level the household never spent.
    const mean = months.reduce((t, m) => t + m.amountMinor, 0n) / 12n;
    assert.equal(mean, 8_333_333n);
    assert.ok(
      baseline.medianMinor! * 3n < mean * 2n,
      "the mean sits well above the normal level, which is why it is not used",
    );
  });

  it("refuses to state a baseline from fewer than three months", () => {
    const baseline = calculateSpendingBaseline({
      monthlyTotals: flatMonths(2, 5_000_000n),
      window: "12m",
    });
    assert.equal(baseline.insufficient, true);
    assert.equal(baseline.medianMinor, null, "two observations are not a normal level");
    assert.equal(baseline.monthsObserved, 2);
  });

  it("windows independently, so a recent change shows up in 3m before 24m", () => {
    const months = [...flatMonths(21, 4_000_000n), ...flatMonths(3, 8_000_000n)];
    const all = calculateAllBaselines(months);
    assert.equal(all["3m"].medianMinor, 8_000_000n, "the recent level");
    assert.equal(all["24m"].medianMinor, 4_000_000n, "the long-run level");
    assert.ok(all["3m"].medianMinor! > all["24m"].medianMinor!);
  });

  it("reports percentiles so a bad month can be distinguished from a normal one", () => {
    const months = [
      ...flatMonths(9, 3_000_000n).slice(0, 9),
      { month: "2026-06", amountMinor: 6_000_000n },
      { month: "2026-07", amountMinor: 7_000_000n },
      { month: "2026-08", amountMinor: 3_000_000n },
    ];
    const baseline = calculateSpendingBaseline({ monthlyTotals: months, window: "12m" });
    assert.ok(baseline.p90Minor! > baseline.medianMinor!);
  });
});

describe("category trends", () => {
  const points = [
    { month: "2025-08", categoryKey: "food", amountMinor: 1_000_000n },
    { month: "2025-09", categoryKey: "food", amountMinor: 1_000_000n },
    { month: "2025-10", categoryKey: "food", amountMinor: 1_000_000n },
    { month: "2025-11", categoryKey: "food", amountMinor: 1_000_000n },
    { month: "2025-12", categoryKey: "food", amountMinor: 1_000_000n },
    { month: "2026-01", categoryKey: "food", amountMinor: 1_000_000n },
    { month: "2026-02", categoryKey: "food", amountMinor: 1_000_000n },
    { month: "2026-03", categoryKey: "food", amountMinor: 1_000_000n },
    { month: "2026-04", categoryKey: "food", amountMinor: 1_000_000n },
    { month: "2026-05", categoryKey: "food", amountMinor: 1_000_000n },
    { month: "2026-06", categoryKey: "food", amountMinor: 1_000_000n },
    { month: "2026-07", categoryKey: "food", amountMinor: 1_000_000n },
    { month: "2026-08", categoryKey: "food", amountMinor: 1_140_000n }, // +14%
  ];

  it("compares against the twelve-month normal, not just last month", () => {
    const trend = calculateCategoryTrend({
      categoryKey: "food",
      points,
      currentMonth: "2026-08",
    });
    assert.equal(trend.thisMonthMinor, 1_140_000n);
    assert.equal(trend.average12mMinor, 1_000_000n);
    assert.equal(trend.changeVsBaselineMinor, 140_000n);
    assert.equal(trend.changeVsBaselinePercent, 14);
    assert.equal(trend.direction, "UP");
  });

  it("gives the year-on-year comparison for the same month", () => {
    const trend = calculateCategoryTrend({
      categoryKey: "food",
      points,
      currentMonth: "2026-08",
    });
    assert.equal(trend.sameMonthLastYearMinor, 1_000_000n, "2025-08, not 2026-07");
    assert.equal(trend.yearOverYearPercent, 14);
  });

  it("calls a small movement flat rather than a trend", () => {
    const trend = calculateCategoryTrend({
      categoryKey: "food",
      points: [...points.slice(0, 12), { month: "2026-08", categoryKey: "food", amountMinor: 1_020_000n }],
      currentMonth: "2026-08",
    });
    assert.equal(trend.direction, "FLAT", "2% is noise");
  });

  it("excludes the month in progress from its own baseline", () => {
    const trend = calculateCategoryTrend({
      categoryKey: "food",
      points,
      currentMonth: "2026-08",
    });
    // The 12m median must be the completed months, so the current month cannot
    // drag its own comparison.
    assert.equal(trend.average12mMinor, 1_000_000n);
  });

  it("says UNKNOWN rather than guessing without history", () => {
    const trend = calculateCategoryTrend({
      categoryKey: "food",
      points: [{ month: "2026-08", categoryKey: "food", amountMinor: 500_000n }],
      currentMonth: "2026-08",
    });
    assert.equal(trend.direction, "UNKNOWN");
    assert.equal(trend.changeVsBaselinePercent, null);
  });

  it("sums year to date for the current year only", () => {
    const trend = calculateCategoryTrend({
      categoryKey: "food",
      points,
      currentMonth: "2026-08",
    });
    // 2026-01 through 2026-07 at 1 000 000, plus 1 140 000 in August.
    assert.equal(trend.ytdMinor, 8_140_000n);
  });
});

describe("driver attribution", () => {
  it("explains a category rise by its subcategories, and the parts sum to the whole", () => {
    // The §23 example: Food up, driven by restaurant and takeaway.
    const before = new Map([
      ["restaurant", 300_000n],
      ["groceries", 700_000n],
      ["takeaway", 100_000n],
      ["coffee", 50_000n],
    ]);
    const after = new Map([
      ["restaurant", 541_000n],
      ["groceries", 793_000n],
      ["takeaway", 162_000n],
      ["coffee", 29_000n],
    ]);
    const { drivers, totalChangeMinor } = calculateChangeDrivers({ before, after });

    assert.equal(totalChangeMinor, 375_000n);
    assert.equal(drivers[0]!.key, "restaurant", "the largest mover leads");
    assert.equal(drivers[0]!.changeMinor, 241_000n);
    // Coffee fell, and that is reported rather than hidden.
    const coffee = drivers.find((d) => d.key === "coffee")!;
    assert.equal(coffee.changeMinor, -21_000n);
    // The arithmetic closes: drivers sum to the parent change.
    assert.equal(
      drivers.reduce<bigint>((total, driver) => total + driver.changeMinor, 0n),
      totalChangeMinor,
    );
  });

  it("handles a category that appeared or disappeared entirely", () => {
    const { drivers } = calculateChangeDrivers({
      before: new Map([["old", 500_000n]]),
      after: new Map([["new", 800_000n]]),
    });
    assert.equal(drivers.length, 2);
    assert.equal(drivers.find((d) => d.key === "new")!.changeMinor, 800_000n);
    assert.equal(drivers.find((d) => d.key === "old")!.changeMinor, -500_000n);
  });

  it("can drop drivers too small to matter", () => {
    const { drivers } = calculateChangeDrivers({
      before: new Map([["big", 100_000n], ["tiny", 100_000n]]),
      after: new Map([["big", 200_000n], ["tiny", 100_100n]]),
      minimumContributionBps: 500,
    });
    assert.equal(drivers.length, 1);
    assert.equal(drivers[0]!.key, "big");
  });
});

describe("one-off purchases", () => {
  it("reports both actual and normalised, and names every exclusion", () => {
    const history = new Map([
      ["home", [40_000n, 50_000n, 45_000n, 38_000n, 52_000n, 41_000n]],
      ["groceries", [80_000n, 120_000n, 95_000n, 110_000n, 100_000n, 90_000n]],
    ]);
    const result = calculateNormalisedSpending({
      transactions: [
        { id: "t1", month: "2026-08", categoryKey: "home", amountMinor: 1_500_000n }, // IKEA
        { id: "t2", month: "2026-08", categoryKey: "groceries", amountMinor: 100_000n },
        { id: "t3", month: "2026-08", categoryKey: "home", amountMinor: 45_000n },
      ],
      categoryHistory: history,
    });
    assert.equal(result.actualMinor, 1_645_000n);
    assert.equal(result.normalisedMinor, 145_000n);
    assert.equal(result.excluded.length, 1);
    assert.equal(result.excluded[0]!.transactionId, "t1");
    assert.match(result.excluded[0]!.reason, /Ovanligt stort köp/);
    assert.ok(
      result.excluded[0]!.reason.includes("15000") || result.excluded[0]!.reason.includes("15 000"),
      `the reason states the amount: ${result.excluded[0]!.reason}`,
    );
  });

  it("does not exclude a large purchase that is normal for its category", () => {
    // A household whose rent is 12 000 every month: that is not a one-off.
    const history = new Map([
      ["housing", [1_200_000n, 1_200_000n, 1_200_000n, 1_200_000n, 1_200_000n, 1_200_000n]],
    ]);
    const result = calculateNormalisedSpending({
      transactions: [
        { id: "r1", month: "2026-08", categoryKey: "housing", amountMinor: 1_200_000n },
      ],
      categoryHistory: history,
    });
    assert.equal(result.excluded.length, 0);
    assert.equal(result.normalisedMinor, result.actualMinor);
  });

  it("never excludes a small purchase however unusual", () => {
    const history = new Map([["coffee", [3_000n, 3_200n, 2_900n, 3_100n, 3_000n, 3_050n]]]);
    const result = calculateNormalisedSpending({
      transactions: [{ id: "c1", month: "2026-08", categoryKey: "coffee", amountMinor: 20_000n }],
      categoryHistory: history,
    });
    assert.equal(result.excluded.length, 0, "200 kr is not a one-off worth excluding");
  });

  it("will not judge a category with too little history", () => {
    const result = calculateNormalisedSpending({
      transactions: [{ id: "x1", month: "2026-08", categoryKey: "new", amountMinor: 5_000_000n }],
      categoryHistory: new Map([["new", [100_000n, 120_000n]]]),
    });
    assert.equal(result.excluded.length, 0, "four observations cannot establish a normal");
  });
});

describe("what changed between two periods (§48)", () => {
  it("reports income, expense and savings change with drivers", () => {
    const comparison = comparePeriodDrivers({
      before: {
        incomeMinor: 6_800_000n,
        expenseMinor: 4_700_000n,
        byCategory: new Map([["food", 1_000_000n], ["travel", 0n]]),
        byMerchant: new Map([["ica", 800_000n]]),
      },
      after: {
        incomeMinor: 6_800_000n,
        expenseMinor: 5_400_000n,
        byCategory: new Map([["food", 1_140_000n], ["travel", 560_000n]]),
        byMerchant: new Map([["ica", 900_000n], ["sas", 560_000n]]),
      },
    });
    assert.equal(comparison.incomeChangeMinor, 0n);
    assert.equal(comparison.expenseChangeMinor, 700_000n);
    assert.equal(comparison.savingsChangeMinor, -700_000n, "savings fell by the expense rise");
    assert.equal(comparison.categoryDrivers[0]!.key, "travel", "the new category leads");
    assert.equal(comparison.merchantDrivers[0]!.key, "sas");
  });

  it("attributes a savings fall to a rise in income as readily as spending", () => {
    const comparison = comparePeriodDrivers({
      before: {
        incomeMinor: 5_000_000n,
        expenseMinor: 4_000_000n,
        byCategory: new Map(),
        byMerchant: new Map(),
      },
      after: {
        incomeMinor: 6_000_000n,
        expenseMinor: 4_000_000n,
        byCategory: new Map(),
        byMerchant: new Map(),
      },
    });
    assert.equal(comparison.savingsChangeMinor, 1_000_000n);
  });
});

describe("merchant analytics", () => {
  it("reports median alongside average, because one big purchase misleads", () => {
    // All inside the twelve months ending 2026-08-10; nothing dated after it,
    // which would be excluded and is not what this test is about.
    const purchases = [
      ...Array.from({ length: 10 }, (_, i) => ({
        date: `2025-${String((i % 4) + 9).padStart(2, "0")}-15`,
        amountMinor: -40_000n,
      })),
      { date: "2026-03-20", amountMinor: -900_000n },
    ];
    const analytics = calculateMerchantAnalytics({
      merchantKey: "ica",
      purchases,
      asOf: "2026-08-10",
    });
    assert.equal(analytics.purchaseCount, 11);
    assert.equal(analytics.medianMinor, 40_000n, "the typical basket");
    assert.ok(analytics.averageMinor! > analytics.medianMinor!, "the average is dragged up");
  });

  it("compares the last twelve months against the twelve before", () => {
    const analytics = calculateMerchantAnalytics({
      merchantKey: "ica",
      purchases: [
        { date: "2024-10-01", amountMinor: -100_000n },
        { date: "2025-01-01", amountMinor: -100_000n },
        { date: "2025-10-01", amountMinor: -150_000n },
        { date: "2026-01-01", amountMinor: -150_000n },
      ],
      asOf: "2026-08-10",
    });
    // Window 2025-08-10 → 2026-08-10 has two purchases at 150 000 = 300 000.
    // Prior window 2024-08-10 → 2025-08-10 has two at 100 000 = 200 000.
    assert.equal(analytics.totalMinor, 300_000n);
    assert.equal(analytics.yearOverYearPercent, 50);
  });

  it("returns nulls rather than dividing by zero for an unseen merchant", () => {
    const analytics = calculateMerchantAnalytics({
      merchantKey: "unseen",
      purchases: [],
      asOf: "2026-08-10",
    });
    assert.equal(analytics.purchaseCount, 0);
    assert.equal(analytics.averageMinor, null);
    assert.equal(analytics.yearOverYearPercent, null);
  });
});
