import {
  isRobustOutlier,
  medianMinor,
  percentChange,
  percentileMinor,
  shareBps,
  trimmedMeanMinor,
} from "./statistics";

/**
 * What is normal for this household, what changed, and why.
 *
 * §21 through §24. Every figure is derived with robust statistics from the
 * household's own history; AI is not consulted and does not appear in this file.
 * A household that spent 40 000 kr at IKEA one month has not raised its normal
 * level, and a baseline that says otherwise is worse than no baseline.
 */

export type CategorySpendPoint = {
  /** `YYYY-MM`. */
  month: string;
  categoryKey: string;
  /** Positive minor units spent. */
  amountMinor: bigint;
};

export type MerchantSpendPoint = {
  month: string;
  merchantKey: string;
  amountMinor: bigint;
};

export type BaselineWindow = "3m" | "6m" | "12m" | "24m";

const WINDOW_MONTHS: Record<BaselineWindow, number> = {
  "3m": 3,
  "6m": 6,
  "12m": 12,
  "24m": 24,
};

export type SpendingBaseline = {
  window: BaselineWindow;
  monthsObserved: number;
  /** The level the household normally lives at. */
  medianMinor: bigint | null;
  /** Less sensitive to a single quiet or expensive month than the median alone. */
  trimmedMeanMinor: bigint | null;
  p25Minor: bigint | null;
  p75Minor: bigint | null;
  p90Minor: bigint | null;
  /** True when the window did not contain enough months to mean anything. */
  insufficient: boolean;
};

/** Take the last n months of a chronological series. */
function tail<T>(values: readonly T[], count: number): T[] {
  return count >= values.length ? [...values] : values.slice(values.length - count);
}

/**
 * Baseline over one window.
 *
 * Three months is the shortest window worth reporting: two months is a pair of
 * observations, and calling that a normal level invites the household to act on
 * noise.
 */
export function calculateSpendingBaseline(input: {
  monthlyTotals: readonly { month: string; amountMinor: bigint }[];
  window: BaselineWindow;
}): SpendingBaseline {
  const months = tail(input.monthlyTotals, WINDOW_MONTHS[input.window]);
  const amounts = months.map((month) => month.amountMinor);
  const insufficient = amounts.length < 3;
  return {
    window: input.window,
    monthsObserved: amounts.length,
    medianMinor: insufficient ? null : medianMinor(amounts),
    trimmedMeanMinor: insufficient ? null : trimmedMeanMinor(amounts, 0.1),
    p25Minor: insufficient ? null : percentileMinor(amounts, 25),
    p75Minor: insufficient ? null : percentileMinor(amounts, 75),
    p90Minor: insufficient ? null : percentileMinor(amounts, 90),
    insufficient,
  };
}

/** All four windows at once, which is what a surface usually wants. */
export function calculateAllBaselines(
  monthlyTotals: readonly { month: string; amountMinor: bigint }[],
): Record<BaselineWindow, SpendingBaseline> {
  return {
    "3m": calculateSpendingBaseline({ monthlyTotals, window: "3m" }),
    "6m": calculateSpendingBaseline({ monthlyTotals, window: "6m" }),
    "12m": calculateSpendingBaseline({ monthlyTotals, window: "12m" }),
    "24m": calculateSpendingBaseline({ monthlyTotals, window: "24m" }),
  };
}

export type TrendDirection = "UP" | "DOWN" | "FLAT" | "UNKNOWN";

export type CategoryTrend = {
  categoryKey: string;
  thisMonthMinor: bigint;
  previousMonthMinor: bigint | null;
  sameMonthLastYearMinor: bigint | null;
  average3mMinor: bigint | null;
  average12mMinor: bigint | null;
  ytdMinor: bigint;
  /** Change against the 12-month normal, which is the comparison that matters. */
  changeVsBaselineMinor: bigint | null;
  changeVsBaselinePercent: number | null;
  changeVsPreviousMonthMinor: bigint | null;
  changeVsPreviousMonthPercent: number | null;
  yearOverYearPercent: number | null;
  direction: TrendDirection;
};

/** A change smaller than this is noise, not a trend. */
const FLAT_THRESHOLD_PERCENT = 5;

function monthsBefore(month: string, count: number): string {
  const [year, monthPart] = month.split("-").map(Number);
  const zeroBased = (year! * 12 + (monthPart! - 1)) - count;
  return `${Math.floor(zeroBased / 12)}-${String((zeroBased % 12) + 1).padStart(2, "0")}`;
}

/**
 * Trend for one category (§22).
 *
 * The headline comparison is against the 12-month median rather than against last
 * month: last month may itself have been unusual, and "up 40% on a quiet month" is
 * a statement about the quiet month.
 */
export function calculateCategoryTrend(input: {
  categoryKey: string;
  /** Chronological, oldest first, one entry per month the category was seen. */
  points: readonly CategorySpendPoint[];
  /** The month being reported, `YYYY-MM`. */
  currentMonth: string;
}): CategoryTrend {
  const forCategory = input.points
    .filter((point) => point.categoryKey === input.categoryKey)
    .sort((a, b) => (a.month < b.month ? -1 : 1));
  const byMonth = new Map(forCategory.map((point) => [point.month, point.amountMinor]));

  const thisMonth = byMonth.get(input.currentMonth) ?? 0n;
  const previousMonth = byMonth.get(monthsBefore(input.currentMonth, 1)) ?? null;
  const lastYear = byMonth.get(monthsBefore(input.currentMonth, 12)) ?? null;

  // Completed months only: the month in progress is not a data point about a
  // normal month until it ends.
  const completed = forCategory.filter((point) => point.month < input.currentMonth);
  const amounts3m = tail(completed, 3).map((p) => p.amountMinor);
  const amounts12m = tail(completed, 12).map((p) => p.amountMinor);
  const average3m = amounts3m.length >= 2 ? medianMinor(amounts3m) : null;
  const average12m = amounts12m.length >= 3 ? medianMinor(amounts12m) : null;

  const currentYear = input.currentMonth.slice(0, 4);
  const ytd = forCategory
    .filter((point) => point.month.startsWith(currentYear))
    .reduce<bigint>((total, point) => total + point.amountMinor, 0n);

  const changeVsBaseline = average12m === null ? null : thisMonth - average12m;
  const changeVsBaselinePercent =
    average12m === null ? null : percentChange(average12m, thisMonth);

  let direction: TrendDirection = "UNKNOWN";
  if (changeVsBaselinePercent !== null) {
    direction =
      changeVsBaselinePercent > FLAT_THRESHOLD_PERCENT
        ? "UP"
        : changeVsBaselinePercent < -FLAT_THRESHOLD_PERCENT
          ? "DOWN"
          : "FLAT";
  }

  return {
    categoryKey: input.categoryKey,
    thisMonthMinor: thisMonth,
    previousMonthMinor: previousMonth,
    sameMonthLastYearMinor: lastYear,
    average3mMinor: average3m,
    average12mMinor: average12m,
    ytdMinor: ytd,
    changeVsBaselineMinor: changeVsBaseline,
    changeVsBaselinePercent,
    changeVsPreviousMonthMinor: previousMonth === null ? null : thisMonth - previousMonth,
    changeVsPreviousMonthPercent:
      previousMonth === null ? null : percentChange(previousMonth, thisMonth),
    yearOverYearPercent: lastYear === null ? null : percentChange(lastYear, thisMonth),
    direction,
  };
}

export type SpendingDriver = {
  key: string;
  changeMinor: bigint;
  /** Share of the parent change this driver accounts for, in basis points. */
  contributionBps: number | null;
};

/**
 * Why did a total change (§23)?
 *
 * Attributes a parent change to its children by comparing each child between the
 * two periods, ordered by absolute contribution so the largest mover leads. The
 * arithmetic is exact: the drivers sum to the parent change.
 */
export function calculateChangeDrivers(input: {
  /** Child totals in the earlier period. */
  before: ReadonlyMap<string, bigint>;
  /** Child totals in the later period. */
  after: ReadonlyMap<string, bigint>;
  /** Drop drivers below this share of the total change, in basis points. */
  minimumContributionBps?: number;
}): { drivers: SpendingDriver[]; totalChangeMinor: bigint } {
  const minimum = input.minimumContributionBps ?? 0;
  const keys = new Set([...input.before.keys(), ...input.after.keys()]);
  const totalBefore = [...input.before.values()].reduce<bigint>((t, v) => t + v, 0n);
  const totalAfter = [...input.after.values()].reduce<bigint>((t, v) => t + v, 0n);
  const totalChange = totalAfter - totalBefore;

  const drivers: SpendingDriver[] = [];
  for (const key of keys) {
    const change = (input.after.get(key) ?? 0n) - (input.before.get(key) ?? 0n);
    if (change === 0n) continue;
    const contribution = shareBps(change, totalChange);
    if (contribution !== null && Math.abs(contribution) < minimum) continue;
    drivers.push({ key, changeMinor: change, contributionBps: contribution });
  }

  drivers.sort((a, b) => {
    const magA = a.changeMinor < 0n ? -a.changeMinor : a.changeMinor;
    const magB = b.changeMinor < 0n ? -b.changeMinor : b.changeMinor;
    return magB > magA ? 1 : magB < magA ? -1 : 0;
  });
  return { drivers, totalChangeMinor: totalChange };
}

export type OneOffCandidate = {
  transactionId: string;
  month: string;
  categoryKey: string;
  amountMinor: bigint;
  reason: string;
};

export type NormalisedSpending = {
  actualMinor: bigint;
  /** Actual minus the identified one-offs. */
  normalisedMinor: bigint;
  excluded: OneOffCandidate[];
};

/**
 * Separate a month's ordinary spending from its exceptional purchases (§24).
 *
 * Both figures are reported, and every exclusion is named: a normalised total that
 * quietly drops 15 000 kr is a number the household cannot check. A purchase counts
 * as exceptional only when it is a robust outlier against that category's own
 * history — an 8 000 kr grocery month is not exceptional for a household whose
 * groceries run to 7 000 kr.
 */
export function calculateNormalisedSpending(input: {
  /** Transactions in the period being normalised. */
  transactions: readonly {
    id: string;
    month: string;
    categoryKey: string;
    amountMinor: bigint;
  }[];
  /** Historical per-transaction amounts per category, for the outlier test. */
  categoryHistory: ReadonlyMap<string, readonly bigint[]>;
  /** Never exclude anything below this, however unusual. */
  minimumOneOffMinor?: bigint;
  madMultiple?: number;
}): NormalisedSpending {
  const floor = input.minimumOneOffMinor ?? 300_000n; // 3 000 kr
  const excluded: OneOffCandidate[] = [];
  let actual = 0n;
  let normalised = 0n;

  for (const transaction of input.transactions) {
    const magnitude =
      transaction.amountMinor < 0n ? -transaction.amountMinor : transaction.amountMinor;
    actual += magnitude;

    const history = input.categoryHistory.get(transaction.categoryKey) ?? [];
    const isLarge = magnitude >= floor;
    const isOutlier =
      history.length >= 5 &&
      isRobustOutlier(magnitude, history, input.madMultiple ?? 4);

    if (isLarge && isOutlier) {
      const typical = medianMinor(history);
      excluded.push({
        transactionId: transaction.id,
        month: transaction.month,
        categoryKey: transaction.categoryKey,
        amountMinor: magnitude,
        reason:
          typical === null
            ? "Ovanligt stort köp i den här kategorin."
            : `Ovanligt stort köp: ${(Number(magnitude) / 100).toFixed(0)} kr mot ett normalt ${(Number(typical) / 100).toFixed(0)} kr i den här kategorin.`,
      });
      continue;
    }
    normalised += magnitude;
  }

  return { actualMinor: actual, normalisedMinor: normalised, excluded };
}

export type PeriodDriverComparison = {
  incomeChangeMinor: bigint;
  expenseChangeMinor: bigint;
  savingsChangeMinor: bigint;
  categoryDrivers: SpendingDriver[];
  merchantDrivers: SpendingDriver[];
  /** Exceptional purchases in either period, which often explain the whole change. */
  oneOffsBefore: OneOffCandidate[];
  oneOffsAfter: OneOffCandidate[];
};

/**
 * What changed between two periods (§48).
 *
 * The central comparison the AI tools are built on: it answers "why is this month
 * different" with arithmetic, so the language layer has something true to
 * summarise rather than something to infer.
 */
export function comparePeriodDrivers(input: {
  before: {
    incomeMinor: bigint;
    expenseMinor: bigint;
    byCategory: ReadonlyMap<string, bigint>;
    byMerchant: ReadonlyMap<string, bigint>;
    oneOffs?: readonly OneOffCandidate[];
  };
  after: {
    incomeMinor: bigint;
    expenseMinor: bigint;
    byCategory: ReadonlyMap<string, bigint>;
    byMerchant: ReadonlyMap<string, bigint>;
    oneOffs?: readonly OneOffCandidate[];
  };
  minimumContributionBps?: number;
}): PeriodDriverComparison {
  const categories = calculateChangeDrivers({
    before: input.before.byCategory,
    after: input.after.byCategory,
    minimumContributionBps: input.minimumContributionBps,
  });
  const merchants = calculateChangeDrivers({
    before: input.before.byMerchant,
    after: input.after.byMerchant,
    minimumContributionBps: input.minimumContributionBps,
  });

  const incomeChange = input.after.incomeMinor - input.before.incomeMinor;
  const expenseChange = input.after.expenseMinor - input.before.expenseMinor;
  return {
    incomeChangeMinor: incomeChange,
    expenseChangeMinor: expenseChange,
    // Savings moves with income and against expenses.
    savingsChangeMinor: incomeChange - expenseChange,
    categoryDrivers: categories.drivers,
    merchantDrivers: merchants.drivers,
    oneOffsBefore: [...(input.before.oneOffs ?? [])],
    oneOffsAfter: [...(input.after.oneOffs ?? [])],
  };
}

export type MerchantAnalytics = {
  merchantKey: string;
  totalMinor: bigint;
  purchaseCount: number;
  averageMinor: bigint | null;
  medianMinor: bigint | null;
  firstSeen: string | null;
  lastSeen: string | null
  yearOverYearPercent: number | null;
};

/**
 * A merchant's history (§28).
 *
 * Median alongside the average, because one large purchase makes an average
 * describe nothing: a household that usually spends 400 kr and once spent 9 000
 * has an average of 1 200 and a median of 400, and only one of those is useful.
 */
export function calculateMerchantAnalytics(input: {
  merchantKey: string;
  purchases: readonly { date: string; amountMinor: bigint }[];
  /** `YYYY-MM-DD` — the end of the 12-month window. */
  asOf: string;
}): MerchantAnalytics {
  const sorted = [...input.purchases].sort((a, b) => (a.date < b.date ? -1 : 1));
  const windowStart = `${Number(input.asOf.slice(0, 4)) - 1}${input.asOf.slice(4)}`;
  const priorStart = `${Number(input.asOf.slice(0, 4)) - 2}${input.asOf.slice(4)}`;

  const inWindow = sorted.filter(
    (purchase) => purchase.date > windowStart && purchase.date <= input.asOf,
  );
  const inPrior = sorted.filter(
    (purchase) => purchase.date > priorStart && purchase.date <= windowStart,
  );

  const amounts = inWindow.map((purchase) =>
    purchase.amountMinor < 0n ? -purchase.amountMinor : purchase.amountMinor,
  );
  const total = amounts.reduce<bigint>((sum, value) => sum + value, 0n);
  const priorTotal = inPrior.reduce<bigint>(
    (sum, purchase) =>
      sum + (purchase.amountMinor < 0n ? -purchase.amountMinor : purchase.amountMinor),
    0n,
  );

  return {
    merchantKey: input.merchantKey,
    totalMinor: total,
    purchaseCount: inWindow.length,
    averageMinor: amounts.length === 0 ? null : total / BigInt(amounts.length),
    medianMinor: medianMinor(amounts),
    firstSeen: sorted[0]?.date ?? null,
    lastSeen: sorted[sorted.length - 1]?.date ?? null,
    yearOverYearPercent: priorTotal === 0n ? null : percentChange(priorTotal, total),
  };
}
