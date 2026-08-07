import { cashRunwayMonths } from "./period-metrics";
import { healthLevelFromScore } from "./forecast";

export type RiskEvidence = {
  kind: string;
  id: string;
  label: string;
  href: string;
};

export type DetectedRiskSignal = {
  id: string;
  dimension: string;
  level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  title: string;
  detail: string;
  score: number;
  evidence: RiskEvidence[];
};

export type HealthDimensionResult = {
  dimension: string;
  score: number;
  level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  summary: string;
};

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function assessLiquidityRisk(input: {
  availableCashMinor: bigint;
  monthlySpendingMinor: bigint;
}): { signal: DetectedRiskSignal; health: HealthDimensionResult } {
  const months = cashRunwayMonths({
    availableCashMinor: input.availableCashMinor,
    monthlySpendingMinor: input.monthlySpendingMinor,
  });
  // Higher runway → better (lower risk score). Target ~6 months = score 85.
  const score = clampScore(months >= 6 ? 90 : (months / 6) * 85);
  const level = healthLevelFromScore(score);
  const health: HealthDimensionResult = {
    dimension: "liquidity",
    score,
    level,
    summary: `Kassareserv ca ${months.toFixed(1)} månader av utgifter.`,
  };
  const signal: DetectedRiskSignal = {
    id: "live:liquidity",
    dimension: "liquidity",
    level,
    title: "Likviditetsbuffert",
    detail: health.summary,
    score,
    evidence: [
      { kind: "page", id: "cashflow", label: "Kassaflöde", href: "/cashflow" },
      { kind: "page", id: "accounts", label: "Konton", href: "/accounts" },
    ],
  };
  return { signal, health };
}

export function assessDebtRisk(input: {
  liabilitiesMinor: bigint;
  monthlyIncomeMinor: bigint;
  mortgageAccountId?: string | null;
}): { signal: DetectedRiskSignal; health: HealthDimensionResult } {
  const annualIncome =
    input.monthlyIncomeMinor > 0n ? input.monthlyIncomeMinor * 12n : 1n;
  const ratio = Number(input.liabilitiesMinor) / Number(annualIncome);
  // Lower debt/income → better. 2x annual income ≈ score 50.
  const score = clampScore(100 - ratio * 25);
  const level = healthLevelFromScore(score);
  const health: HealthDimensionResult = {
    dimension: "debt",
    score,
    level,
    summary: `Skuld / årsinkomst ≈ ${ratio.toFixed(2)}.`,
  };
  const signal: DetectedRiskSignal = {
    id: "live:debt",
    dimension: "debt",
    level,
    title: "Skuldbörda",
    detail: health.summary,
    score,
    evidence: [
      { kind: "page", id: "debt", label: "Skulder", href: "/debt" },
      ...(input.mortgageAccountId
        ? [
            {
              kind: "account",
              id: input.mortgageAccountId,
              label: "Bolån",
              href: `/accounts/${input.mortgageAccountId}`,
            },
          ]
        : []),
    ],
  };
  return { signal, health };
}

export function assessFixedCostRisk(input: {
  fixedAnnualMinor: bigint;
  monthlyIncomeMinor: bigint;
}): { signal: DetectedRiskSignal; health: HealthDimensionResult } {
  const annualIncome =
    input.monthlyIncomeMinor > 0n ? input.monthlyIncomeMinor * 12n : 1n;
  const share = Number(input.fixedAnnualMinor) / Number(annualIncome);
  const score = clampScore(100 - share * 100);
  const level = healthLevelFromScore(score);
  const health: HealthDimensionResult = {
    dimension: "fixed_costs",
    score,
    level,
    summary: `Fasta kostnader ≈ ${(share * 100).toFixed(0)} % av årsinkomst.`,
  };
  const signal: DetectedRiskSignal = {
    id: "live:fixed-costs",
    dimension: "fixed_costs",
    level,
    title: "Fasta kostnader",
    detail: health.summary,
    score,
    evidence: [
      {
        kind: "page",
        id: "subscriptions",
        label: "Abonnemang",
        href: "/subscriptions",
      },
      { kind: "page", id: "contracts", label: "Avtal", href: "/contracts" },
    ],
  };
  return { signal, health };
}

export function assessCoverageRisk(input: {
  coveragePercent: number;
}): { signal: DetectedRiskSignal; health: HealthDimensionResult } {
  const score = clampScore(input.coveragePercent);
  const level = healthLevelFromScore(score);
  const health: HealthDimensionResult = {
    dimension: "data_coverage",
    score,
    level,
    summary: `Datatäckning ca ${score} %.`,
  };
  const signal: DetectedRiskSignal = {
    id: "live:coverage",
    dimension: "data_coverage",
    level,
    title: "Datatäckning",
    detail: health.summary,
    score,
    evidence: [
      {
        kind: "page",
        id: "integrations",
        label: "Integrationer",
        href: "/integrations",
      },
      { kind: "page", id: "review", label: "Granskning", href: "/review" },
    ],
  };
  return { signal, health };
}

export function assessVehicleFinancingRisk(input: {
  negativeEquity: boolean;
  netEquityMinor: bigint;
  vehicleId?: string | null;
}): DetectedRiskSignal | null {
  if (!input.negativeEquity && input.netEquityMinor >= 0n) {
    return {
      id: "live:vehicle-equity",
      dimension: "vehicle",
      level: "LOW",
      title: "Fordonsfinansiering",
      detail: "Positiv fordons-equity i senaste beräkningen.",
      score: 82,
      evidence: input.vehicleId
        ? [
            {
              kind: "vehicle",
              id: input.vehicleId,
              label: "Fordon",
              href: `/vehicles/${input.vehicleId}`,
            },
          ]
        : [{ kind: "page", id: "vehicles", label: "Fordon", href: "/vehicles" }],
    };
  }
  return {
    id: "live:vehicle-equity",
    dimension: "vehicle",
    level: "HIGH",
    title: "Negativ fordons-equity",
    detail: "Skuld överstiger uppskattat nettoförsäljningsvärde.",
    score: 35,
    evidence: input.vehicleId
      ? [
          {
            kind: "vehicle",
            id: input.vehicleId,
            label: "Fordon",
            href: `/vehicles/${input.vehicleId}`,
          },
        ]
      : [{ kind: "page", id: "vehicles", label: "Fordon", href: "/vehicles" }],
  };
}
