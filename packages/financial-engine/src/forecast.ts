export type ForecastSeed = {
  startingCashMinor: bigint;
  startingNetWorthMinor: bigint;
  monthlyNetSavingsMinor: bigint;
  asOf: string;
};

/** Estimate annual saving from a modest mortgage rate renegotiation (~10% of interest). */
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

const HORIZONS = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 60, label: "60d" },
  { days: 90, label: "90d" },
  { days: 180, label: "6m" },
  { days: 365, label: "12m" },
] as const;

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

export function savingsOptimizerSuggestions(input: {
  subscriptionAnnualMinor: bigint;
  mortgageInterestAnnualMinor: bigint;
  lifestyleOverBudgetMinor: bigint;
}) {
  const items: Array<{
    id: string;
    title: string;
    estimatedAnnualSavingMinor: bigint;
    effort: string;
  }> = [];
  if (input.subscriptionAnnualMinor > 1_500_00n) {
    items.push({
      id: "subs-trim",
      title: "Trimma abonnemang",
      estimatedAnnualSavingMinor: input.subscriptionAnnualMinor / 5n,
      effort: "low",
    });
  }
  if (input.mortgageInterestAnnualMinor > 20_000_00n) {
    items.push({
      id: "rate-negotiate",
      title: "Förhandla bolåneränta",
      estimatedAnnualSavingMinor: estimateMortgageRateSavingMinor(
        input.mortgageInterestAnnualMinor,
      ),
      effort: "medium",
    });
  }
  if (input.lifestyleOverBudgetMinor > 0n) {
    items.push({
      id: "lifestyle-cap",
      title: "Sänk livsstilsbudgettak",
      estimatedAnnualSavingMinor: input.lifestyleOverBudgetMinor * 6n,
      effort: "medium",
    });
  }
  return items;
}

export function healthLevelFromScore(score: number): "LOW" | "MODERATE" | "HIGH" | "CRITICAL" {
  if (score >= 80) return "LOW";
  if (score >= 60) return "MODERATE";
  if (score >= 40) return "HIGH";
  return "CRITICAL";
}
