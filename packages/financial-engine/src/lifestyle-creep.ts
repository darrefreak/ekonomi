export type MonthlySpendPoint = {
  month: string; // YYYY-MM
  spendingMinor: bigint;
};

export type CategorySpend = {
  categoryKey: string;
  categoryName: string;
  recentMinor: bigint;
  baselineMinor: bigint;
};

export type LifestyleCreepResult = {
  recentAvgMonthlyMinor: bigint;
  baselineAvgMonthlyMinor: bigint;
  deltaMinor: bigint;
  deltaPercent: number | null;
  creeping: boolean;
  drivers: Array<{
    categoryKey: string;
    categoryName: string;
    deltaMinor: bigint;
    deltaPercent: number | null;
  }>;
};

function avg(values: bigint[]): bigint {
  if (!values.length) return 0n;
  return values.reduce((a, b) => a + b, 0n) / BigInt(values.length);
}

function pct(delta: bigint, base: bigint): number | null {
  if (base === 0n) return null;
  return (Number(delta) / Number(base)) * 100;
}

/**
 * Compare last 3 months average spend vs prior 12 months baseline (METRICS.md §10).
 */
export function calculateLifestyleCreep(input: {
  monthlyPoints: MonthlySpendPoint[];
  asOf: string;
  categorySpends?: CategorySpend[];
  creepThresholdPercent?: number;
}): LifestyleCreepResult {
  const threshold = input.creepThresholdPercent ?? 8;
  const asOfMonth = input.asOf.slice(0, 7);
  const sorted = [...input.monthlyPoints]
    .filter((p) => p.month <= asOfMonth)
    .sort((a, b) => a.month.localeCompare(b.month));

  const recent = sorted.slice(-3);
  const baseline = sorted.slice(0, Math.max(0, sorted.length - 3)).slice(-12);

  const recentAvg = avg(recent.map((p) => p.spendingMinor));
  const baselineAvg = avg(baseline.map((p) => p.spendingMinor));
  const delta = recentAvg - baselineAvg;
  const deltaPercent = pct(delta, baselineAvg);
  const creeping =
    deltaPercent != null && deltaPercent >= threshold && delta > 0n;

  const drivers = (input.categorySpends ?? [])
    .map((c) => {
      const d = c.recentMinor - c.baselineMinor;
      return {
        categoryKey: c.categoryKey,
        categoryName: c.categoryName,
        deltaMinor: d,
        deltaPercent: pct(d, c.baselineMinor),
      };
    })
    .filter((d) => d.deltaMinor > 0n)
    .sort((a, b) => (a.deltaMinor > b.deltaMinor ? -1 : 1))
    .slice(0, 5);

  return {
    recentAvgMonthlyMinor: recentAvg,
    baselineAvgMonthlyMinor: baselineAvg,
    deltaMinor: delta,
    deltaPercent,
    creeping,
    drivers,
  };
}
