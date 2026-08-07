import {
  buildForecastPoints,
  estimateMortgageRateSavingMinor,
} from "./forecast";
import { calculateNetSavingsRate } from "./savings-rate";

export { estimateMortgageRateSavingMinor };

export type PeriodMoneyTotals = {
  incomeMinor: bigint;
  spendingMinor: bigint;
  /** Sum of financial_events.net_worth_delta_minor for the period. */
  netWorthDeltaMinor: bigint;
  debtReductionMinor: bigint;
};

export function periodSavingsMinor(totals: PeriodMoneyTotals): bigint {
  return totals.incomeMinor - totals.spendingMinor;
}

export function periodSavingsRatePercent(totals: PeriodMoneyTotals): number {
  return calculateNetSavingsRate({
    incomeMinor: totals.incomeMinor,
    spendingMinor: totals.spendingMinor,
  });
}

export type NetWorthAttribution = {
  key: string;
  label: string;
  amountMinor: bigint;
};

/**
 * Attribute monthly NW change using event aggregates.
 * Savings ≈ income − spending; residual goes to "other".
 */
export function attributeNetWorthChange(totals: PeriodMoneyTotals): {
  changeMonthMinor: bigint;
  attribution: NetWorthAttribution[];
} {
  const changeMonthMinor = totals.netWorthDeltaMinor;
  const savingsMinor = periodSavingsMinor(totals);
  const debtNoteMinor = totals.debtReductionMinor;
  const otherMinor = changeMonthMinor - savingsMinor;

  const attribution: NetWorthAttribution[] = [
    {
      key: "savings",
      label: "Sparande (inkomst − utgift)",
      amountMinor: savingsMinor,
    },
  ];
  if (debtNoteMinor !== 0n) {
    attribution.push({
      key: "debt_reduction",
      label: "Amortering (skuldminskning)",
      amountMinor: debtNoteMinor,
    });
  }
  if (otherMinor !== 0n) {
    attribution.push({
      key: "other",
      label: "Övrig NW-effekt",
      amountMinor: otherMinor,
    });
  }
  return { changeMonthMinor, attribution };
}

export function cashRunwayMonths(input: {
  availableCashMinor: bigint;
  monthlySpendingMinor: bigint;
}): number {
  if (input.monthlySpendingMinor <= 0n) return 0;
  return Number(input.availableCashMinor) / Number(input.monthlySpendingMinor);
}

/** Projected cashflow deltas (not absolute cash) for dashboard horizons. */
export function forecastCashflowDeltas(input: {
  startingCashMinor: bigint;
  startingNetWorthMinor: bigint;
  monthlyNetSavingsMinor: bigint;
  asOf: string;
}): { days30: bigint; days60: bigint; days90: bigint } {
  const points = buildForecastPoints({
    startingCashMinor: input.startingCashMinor,
    startingNetWorthMinor: input.startingNetWorthMinor,
    monthlyNetSavingsMinor: input.monthlyNetSavingsMinor,
    asOf: input.asOf,
  });
  const byLabel = new Map(points.map((p) => [p.label, p]));
  const delta = (label: string) => {
    const p = byLabel.get(label);
    if (!p) return 0n;
    return p.projectedCashMinor - input.startingCashMinor;
  };
  return {
    days30: delta("30d"),
    days60: delta("60d"),
    days90: delta("90d"),
  };
}
