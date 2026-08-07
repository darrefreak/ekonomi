export type MonthlyCashflowPoint = {
  month: string; // YYYY-MM
  incomeMinor: bigint;
  spendingMinor: bigint;
  savingsMinor: bigint;
};

export type PeriodTotals = {
  incomeMinor: bigint;
  spendingMinor: bigint;
  savingsMinor: bigint;
};

export function buildMonthlyCashflow(
  months: string[],
  byMonth: Record<string, { incomeMinor: bigint; spendingMinor: bigint }>,
): MonthlyCashflowPoint[] {
  return months.map((month) => {
    const incomeMinor = byMonth[month]?.incomeMinor ?? 0n;
    const spendingMinor = byMonth[month]?.spendingMinor ?? 0n;
    return {
      month,
      incomeMinor,
      spendingMinor,
      savingsMinor: incomeMinor - spendingMinor,
    };
  });
}

export function summarizePeriod(points: MonthlyCashflowPoint[]): PeriodTotals {
  return points.reduce(
    (acc, p) => ({
      incomeMinor: acc.incomeMinor + p.incomeMinor,
      spendingMinor: acc.spendingMinor + p.spendingMinor,
      savingsMinor: acc.savingsMinor + p.savingsMinor,
    }),
    { incomeMinor: 0n, spendingMinor: 0n, savingsMinor: 0n },
  );
}

export function comparePeriods(current: PeriodTotals, previous: PeriodTotals) {
  const spendingDeltaMinor = current.spendingMinor - previous.spendingMinor;
  const incomeDeltaMinor = current.incomeMinor - previous.incomeMinor;
  const spendingDeltaPercent =
    previous.spendingMinor === 0n
      ? 0
      : Number((spendingDeltaMinor * 10_000n) / previous.spendingMinor) / 100;
  return {
    spendingDeltaMinor,
    incomeDeltaMinor,
    spendingDeltaPercent,
  };
}
