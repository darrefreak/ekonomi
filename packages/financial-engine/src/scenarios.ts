import { buildForecastPoints, type ForecastPoint, type ForecastSeed } from "./forecast";

export type ScenarioAssumptions = {
  /** Monthly income change (positive = more income). */
  monthlyIncomeDeltaMinor?: bigint;
  /** Monthly expense change (positive = higher spend → lower savings). */
  monthlyExpenseDeltaMinor?: bigint;
  /** One-time cash / NW adjustment at asOf (e.g. vehicle sale). */
  oneTimeCashDeltaMinor?: bigint;
};

export type ScenarioSimulation = {
  baselineMonthlySavingsMinor: bigint;
  adjustedMonthlySavingsMinor: bigint;
  projectedMonthlyDeltaMinor: bigint;
  startingCashMinor: bigint;
  startingNetWorthMinor: bigint;
  points: ForecastPoint[];
};

/**
 * Non-destructive scenario engine: adjusts monthly savings + optional one-time
 * cash shock, then projects with the same deterministic forecast horizons.
 * Never mutates ledger state — pure function only.
 */
export function simulateScenario(input: {
  baseline: ForecastSeed;
  assumptions: ScenarioAssumptions;
}): ScenarioSimulation {
  const incomeDelta = input.assumptions.monthlyIncomeDeltaMinor ?? 0n;
  const expenseDelta = input.assumptions.monthlyExpenseDeltaMinor ?? 0n;
  const oneTime = input.assumptions.oneTimeCashDeltaMinor ?? 0n;

  const adjustedMonthly =
    input.baseline.monthlyNetSavingsMinor + incomeDelta - expenseDelta;
  const startingCashMinor = input.baseline.startingCashMinor + oneTime;
  const startingNetWorthMinor = input.baseline.startingNetWorthMinor + oneTime;

  const points = buildForecastPoints({
    startingCashMinor,
    startingNetWorthMinor,
    monthlyNetSavingsMinor: adjustedMonthly,
    asOf: input.baseline.asOf,
  });

  return {
    baselineMonthlySavingsMinor: input.baseline.monthlyNetSavingsMinor,
    adjustedMonthlySavingsMinor: adjustedMonthly,
    projectedMonthlyDeltaMinor:
      adjustedMonthly - input.baseline.monthlyNetSavingsMinor,
    startingCashMinor,
    startingNetWorthMinor,
    points,
  };
}

export function parseScenarioAssumptions(
  raw: Record<string, unknown>,
): ScenarioAssumptions {
  const asBig = (v: unknown): bigint | undefined => {
    if (v == null) return undefined;
    if (typeof v === "bigint") return v;
    if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
    if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v);
    return undefined;
  };
  return {
    monthlyIncomeDeltaMinor: asBig(raw.monthlyIncomeDeltaMinor),
    monthlyExpenseDeltaMinor: asBig(raw.monthlyExpenseDeltaMinor),
    oneTimeCashDeltaMinor: asBig(raw.oneTimeCashDeltaMinor),
  };
}
