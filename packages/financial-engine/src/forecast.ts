export type ForecastSeed = {
  startingCashMinor: bigint;
  startingNetWorthMinor: bigint;
  monthlyNetSavingsMinor: bigint;
  asOf: string;
};

/**
 * @deprecated Heuristic (~10% of interest). Prefer mortgage scenario via
 * `detectMortgageRateOpportunity` / `monthlyInterestFromRateMinor`.
 */
export function estimateMortgageRateSavingMinor(
  mortgageInterestAnnualMinor: bigint,
): bigint {
  if (mortgageInterestAnnualMinor <= 0n) return 0n;
  return mortgageInterestAnnualMinor / 10n;
}

export type ForecastPoint = {
  onDate: string;
  projectedCashMinor: bigint;
  projectedNetWorthMinor: bigint;
  label: string;
};

/** Canonical deterministic horizons: 7d through 12m. */
export const FORECAST_HORIZONS = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 60, label: "60d" },
  { days: 90, label: "90d" },
  { days: 180, label: "6m" },
  { days: 365, label: "12m" },
] as const;

const HORIZONS = FORECAST_HORIZONS;

export function buildForecastPoints(seed: ForecastSeed): ForecastPoint[] {
  const daily = seed.monthlyNetSavingsMinor / 30n;
  return HORIZONS.map((h) => {
    const delta = daily * BigInt(h.days);
    const d = new Date(`${seed.asOf}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + h.days);
    return {
      onDate: d.toISOString().slice(0, 10),
      projectedCashMinor: seed.startingCashMinor + delta,
      projectedNetWorthMinor: seed.startingNetWorthMinor + delta,
      label: h.label,
    };
  });
}

export type OptimizerSuggestion = {
  id: string;
  title: string;
  estimatedAnnualSavingMinor: bigint;
  effort: string;
  estimateBasis?: string;
};

/**
 * Optimizer items must not invent fake % savings.
 * Pass through already-computed opportunity impacts (caller supplies).
 */
export function savingsOptimizerSuggestions(input: {
  items: OptimizerSuggestion[];
}): OptimizerSuggestion[] {
  return input.items.filter((i) => i.estimatedAnnualSavingMinor > 0n);
}

export function healthLevelFromScore(score: number): "LOW" | "MODERATE" | "HIGH" | "CRITICAL" {
  if (score >= 80) return "LOW";
  if (score >= 60) return "MODERATE";
  if (score >= 40) return "HIGH";
  return "CRITICAL";
}
