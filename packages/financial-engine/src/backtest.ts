import { buildForecastPoints } from "./forecast";

export type ForecastActualComparison = {
  label: string;
  onDate: string;
  projectedCashMinor: bigint;
  actualCashMinor: bigint;
  projectedNetWorthMinor: bigint;
  actualNetWorthMinor: bigint;
  cashErrorMinor: bigint;
  netWorthErrorMinor: bigint;
};

export type ForecastAccuracyMetric = {
  horizonLabel: string;
  sampleCount: number;
  /** Mean absolute cash error / |actual| as percent; null if actual is 0. */
  mapeCashPercent: number | null;
  mapeNetWorthPercent: number | null;
  absCashErrorMinor: bigint;
  absNetWorthErrorMinor: bigint;
};

/**
 * Backtesting infra: project forward from a synthetic past asOf using the same
 * linear model, then compare the matured horizon point to current actuals.
 * Deterministic and ledger-safe (read-only inputs).
 */
export function backtestLinearForecast(input: {
  asOf: string;
  actualCashMinor: bigint;
  actualNetWorthMinor: bigint;
  monthlyNetSavingsMinor: bigint;
  lookbackDays?: number;
}): {
  pastAsOf: string;
  comparisons: ForecastActualComparison[];
  metrics: ForecastAccuracyMetric[];
} {
  const lookback = input.lookbackDays ?? 30;
  const past = new Date(`${input.asOf}T00:00:00.000Z`);
  past.setUTCDate(past.getUTCDate() - lookback);
  const pastAsOf = past.toISOString().slice(0, 10);

  const daily = input.monthlyNetSavingsMinor / 30n;
  const pastCash = input.actualCashMinor - daily * BigInt(lookback);
  const pastNw = input.actualNetWorthMinor - daily * BigInt(lookback);

  const points = buildForecastPoints({
    startingCashMinor: pastCash,
    startingNetWorthMinor: pastNw,
    monthlyNetSavingsMinor: input.monthlyNetSavingsMinor,
    asOf: pastAsOf,
  });

  const matured = points.filter((p) => p.onDate <= input.asOf);
  const comparisons: ForecastActualComparison[] = matured.map((p) => {
    const cashError = input.actualCashMinor - p.projectedCashMinor;
    const nwError = input.actualNetWorthMinor - p.projectedNetWorthMinor;
    return {
      label: p.label,
      onDate: p.onDate,
      projectedCashMinor: p.projectedCashMinor,
      actualCashMinor: input.actualCashMinor,
      projectedNetWorthMinor: p.projectedNetWorthMinor,
      actualNetWorthMinor: input.actualNetWorthMinor,
      cashErrorMinor: cashError,
      netWorthErrorMinor: nwError,
    };
  });

  const metrics: ForecastAccuracyMetric[] = comparisons.map((c) => {
    const absCash = c.cashErrorMinor < 0n ? -c.cashErrorMinor : c.cashErrorMinor;
    const absNw =
      c.netWorthErrorMinor < 0n ? -c.netWorthErrorMinor : c.netWorthErrorMinor;
    const mapeCash =
      input.actualCashMinor === 0n
        ? null
        : Number((absCash * 10_000n) / absBig(input.actualCashMinor)) / 100;
    const mapeNw =
      input.actualNetWorthMinor === 0n
        ? null
        : Number((absNw * 10_000n) / absBig(input.actualNetWorthMinor)) / 100;
    return {
      horizonLabel: c.label,
      sampleCount: 1,
      mapeCashPercent: mapeCash,
      mapeNetWorthPercent: mapeNw,
      absCashErrorMinor: absCash,
      absNetWorthErrorMinor: absNw,
    };
  });

  return { pastAsOf, comparisons, metrics };
}

function absBig(n: bigint): bigint {
  return n < 0n ? -n : n;
}
