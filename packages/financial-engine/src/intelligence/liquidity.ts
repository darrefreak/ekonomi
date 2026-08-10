import {
  medianMinor,
  percentileMinor,
  riskVolatilityBps,
  robustVolatilityBps,
} from "./statistics";

/**
 * How much readily available money does *this* household actually need?
 *
 * §30 forbids the universal rule. "Three months' salary" describes no household in
 * particular: a household with stable income and flat costs needs less than one
 * with irregular income and an annual insurance bill, and telling both the same
 * number is advice that happens to be right by accident at best.
 *
 * Every figure here is derived from the household's own history, with bigint
 * arithmetic, and every component is reported separately (§31) so the total is
 * explainable rather than magic.
 */

export type SpendingClass = "ESSENTIAL" | "SEMI_DISCRETIONARY" | "DISCRETIONARY";

export type MonthlyCostObservation = {
  /** `YYYY-MM`. */
  month: string;
  /** Positive minor units: what the household spent that month in this class. */
  essentialMinor: bigint;
  semiDiscretionaryMinor: bigint;
  discretionaryMinor: bigint;
};

export type IncomeObservation = {
  /** `YYYY-MM`. */
  month: string;
  /** Positive minor units received. */
  amountMinor: bigint;
};

export type UpcomingObligation = {
  label: string;
  amountMinor: bigint;
  /** `YYYY-MM-DD`. */
  dueDate: string;
  confidence: number;
};

export type SinkingFundState = {
  label: string;
  /** What the fund is for in total. */
  targetMinor: bigint;
  /** What has already been set aside — must not be demanded twice (§64). */
  fundedMinor: bigint;
};

export type LiquidityInput = {
  /** Chronological, oldest first. More months means a better answer. */
  monthlyCosts: readonly MonthlyCostObservation[];
  monthlyIncome: readonly IncomeObservation[];
  /** Obligations inside the planning horizon. */
  upcomingObligations: readonly UpcomingObligation[];
  sinkingFunds: readonly SinkingFundState[];
  /** Liquid cash available today, positive minor units. */
  liquidCashMinor: bigint;
  /** 0–100 from the existing coverage engine. Scales confidence, not the amount. */
  coveragePercent: number;
  /** Days since the newest transaction. Scales confidence for "today" figures. */
  dataAgeDays: number;
  /**
   * The household's own financial policy, from `household_settings`.
   *
   * These are explicit choices, not model output, so they are respected rather
   * than recomputed. The safety margin in particular was previously a hardcoded
   * 5% here, which quietly overrode a number the household had set.
   *
   * The configured emergency fund target is deliberately *not* used as the
   * reserve: deriving that from actual essential costs is the whole point of §30.
   * It is reported alongside the derived figure so a disagreement is visible
   * instead of one silently winning.
   */
  policy?: {
    minimumCashBalanceMinor?: bigint;
    emergencyFundTargetMinor?: bigint;
    safetyMarginMinor?: bigint;
  };
};

export type LiquidityComponent = {
  key:
    | "OPERATING_CASH"
    | "EMERGENCY_RESERVE"
    | "IRREGULAR_EXPENSE_RESERVE"
    | "EXPENSE_VOLATILITY_BUFFER"
    | "INCOME_RISK_BUFFER"
    | "UPCOMING_PLANNED_EXPENSES"
    | "SAFETY_MARGIN"
    | "SINKING_FUNDS";
  amountMinor: bigint;
  /** Plain-language reason, shown under "why am I seeing this" (§51). */
  reason: string;
};

export type LiquidityConfidence = "LOW" | "MODERATE" | "HIGH";

export type LiquidityRequirement = {
  components: LiquidityComponent[];
  requiredMinor: bigint;
  /** Three levels rather than one number, to avoid false precision (§36). */
  minimumMinor: bigint;
  recommendedMinor: bigint;
  conservativeMinor: bigint;
  /** Cash minus requirement. Negative means a shortfall. */
  surplusMinor: bigint;
  shortfallMinor: bigint;
  confidence: LiquidityConfidence;
  /** What limited the confidence, if anything. */
  confidenceReasons: string[];
  /**
   * The household's configured emergency fund target against the derived reserve.
   *
   * Present only when a target is configured. Neither number overrides the other;
   * showing both is what lets a household see that its own target is well under
   * what two years of its own costs suggest.
   */
  policyComparison: {
    configuredEmergencyFundMinor: bigint;
    derivedEmergencyReserveMinor: bigint;
    differenceMinor: bigint;
  } | null;
  /** Inputs the recommendation rests on, for explainability. */
  basis: {
    monthsOfHistory: number;
    essentialMedianMinor: bigint | null;
    essentialP75Minor: bigint | null;
    essentialP90Minor: bigint | null;
    incomeVolatilityBps: number | null;
    expenseVolatilityBps: number | null;
    largestIncomeShareBps: number | null;
    coveragePercent: number;
    dataAgeDays: number;
  };
};

/** Below this many months of history the model refuses to sound certain. */
const MIN_MONTHS_FOR_CONFIDENCE = 6;
const MONTHS_FOR_HIGH_CONFIDENCE = 12;
/** Data older than this makes "surplus today" unreliable (§53). */
const STALE_DATA_DAYS = 21;

function totalCost(observation: MonthlyCostObservation): bigint {
  return (
    observation.essentialMinor +
    observation.semiDiscretionaryMinor +
    observation.discretionaryMinor
  );
}

/**
 * Compute the household's liquidity requirement.
 *
 * The components are additive and deliberately non-overlapping (§39): operating
 * cash covers the month in progress, the emergency reserve covers income stopping,
 * the irregular reserve covers bills that do not arrive monthly, and the
 * volatility buffers cover the difference between a normal month and a bad one.
 * Anything already set aside in a sinking fund is counted once, as a fund, not
 * again as a reserve.
 */
export function calculateLiquidityRequirement(
  input: LiquidityInput,
): LiquidityRequirement {
  const essentials = input.monthlyCosts.map((month) => month.essentialMinor);
  const totals = input.monthlyCosts.map(totalCost);
  const incomes = input.monthlyIncome.map((month) => month.amountMinor);
  const monthsOfHistory = input.monthlyCosts.length;

  const essentialMedian = medianMinor(essentials);
  const essentialP75 = percentileMinor(essentials, 75);
  const essentialP90 = percentileMinor(essentials, 90);
  const totalMedian = medianMinor(totals);
  const expenseVolatilityBps = robustVolatilityBps(essentials);
  // Income uses the downside-aware measure: a salary that is steady two months in
  // three and collapses in the third has a MAD of zero while plainly carrying risk.
  const incomeVolatilityBps = riskVolatilityBps(incomes);

  const components: LiquidityComponent[] = [];

  /*
   * Operating cash: one normal month of everything, not just essentials.
   *
   * This is the money that is spent and replaced continuously. Sizing it on
   * essentials alone would mean the household dips into its emergency reserve for
   * ordinary discretionary spending, which is how a reserve quietly disappears.
   */
  const derivedOperating = totalMedian ?? 0n;
  const configuredMinimum = input.policy?.minimumCashBalanceMinor ?? 0n;
  // A configured minimum is a floor the household has chosen; the model may ask
  // for more than it, never less.
  const operating =
    configuredMinimum > derivedOperating ? configuredMinimum : derivedOperating;
  components.push({
    key: "OPERATING_CASH",
    amountMinor: operating,
    reason:
      totalMedian === null
        ? configuredMinimum > 0n
          ? "Ingen historik — din inställda lägsta kassa används."
          : "Ingen historik — löpande behov kan inte beräknas."
        : operating > derivedOperating
          ? `Din inställda lägsta kassa, som ligger över en normal månads utgifter (median av ${monthsOfHistory} månader).`
          : `En normal månads utgifter (median av ${monthsOfHistory} månader).`,
  });

  /*
   * Emergency reserve: essential costs for a number of months that depends on how
   * dependable the income is.
   *
   * Volatile income needs a longer runway, because the gap it has to bridge is
   * both more likely and less predictable. Steady income needs less.
   */
  const incomeVolatility = incomeVolatilityBps ?? 0;
  const reserveMonths = incomeVolatility >= 3000 ? 4 : incomeVolatility >= 1500 ? 3 : 2;
  const essentialBase = essentialP75 ?? essentialMedian ?? 0n;
  const emergency = essentialBase * BigInt(reserveMonths);
  components.push({
    key: "EMERGENCY_RESERVE",
    amountMinor: emergency,
    reason:
      essentialBase === 0n
        ? "Nödvändiga kostnader kunde inte beräknas ur historiken."
        : `${reserveMonths} månaders nödvändiga kostnader (P75), vald utifrån inkomstens variation (${(incomeVolatility / 100).toFixed(0)} %).`,
  });

  /*
   * Irregular expense reserve: the gap between a bad month and a normal one.
   *
   * P90 minus the median is what the household has actually experienced as an
   * unusually expensive month, which is a better basis than a percentage anybody
   * picked.
   */
  const irregular =
    essentialP90 !== null && essentialMedian !== null && essentialP90 > essentialMedian
      ? essentialP90 - essentialMedian
      : 0n;
  components.push({
    key: "IRREGULAR_EXPENSE_RESERVE",
    amountMinor: irregular,
    reason:
      irregular === 0n
        ? "Historiken visar inga ovanligt dyra månader."
        : "Skillnaden mellan en dyr månad (P90) och en normal månad i din egen historik.",
  });

  /*
   * Expense volatility buffer (§34): scaled by how much essentials actually move.
   *
   * Expressed as a share of a normal month, capped, so a household with one
   * chaotic month is not told to hold a permanently enormous buffer.
   */
  const volatilityShareBps = Math.min(5000, expenseVolatilityBps ?? 0);
  const volatilityBuffer =
    essentialMedian === null
      ? 0n
      : (essentialMedian * BigInt(volatilityShareBps)) / 10_000n;
  components.push({
    key: "EXPENSE_VOLATILITY_BUFFER",
    amountMinor: volatilityBuffer,
    reason:
      volatilityBuffer === 0n
        ? "Dina nödvändiga kostnader är stabila mellan månaderna."
        : `Dina nödvändiga kostnader varierar ${(volatilityShareBps / 100).toFixed(0)} % mellan månaderna.`,
  });

  /*
   * Income risk buffer: only when income is genuinely irregular, or when one
   * source dominates.
   *
   * Concentration is a fact about the data. It is deliberately *not* an inference
   * about job security from an employer's name (§35).
   */
  const largestIncomeShareBps = largestShareBps(incomes);
  const concentrated = largestIncomeShareBps !== null && largestIncomeShareBps >= 8000;
  const incomeRisk =
    essentialMedian === null
      ? 0n
      : concentrated || incomeVolatility >= 2000
        ? (essentialMedian * 50n) / 100n
        : 0n;
  components.push({
    key: "INCOME_RISK_BUFFER",
    amountMinor: incomeRisk,
    reason:
      incomeRisk === 0n
        ? "Inkomsten är jämn och kommer från mer än en källa."
        : concentrated
          ? `${((largestIncomeShareBps ?? 0) / 100).toFixed(0)} % av inkomsten kommer från en enda källa.`
          : `Inkomsten varierar ${(incomeVolatility / 100).toFixed(0)} % mellan månaderna.`,
  });

  /*
   * Upcoming planned expenses (§64: raising these must never lower the total).
   *
   * Weighted by confidence, so a likely obligation counts more than a speculative
   * one, but never negatively.
   */
  const upcoming = input.upcomingObligations.reduce<bigint>((total, obligation) => {
    const weight = BigInt(Math.max(0, Math.min(100, Math.round(obligation.confidence))));
    return total + (obligation.amountMinor * weight) / 100n;
  }, 0n);
  components.push({
    key: "UPCOMING_PLANNED_EXPENSES",
    amountMinor: upcoming,
    reason:
      input.upcomingObligations.length === 0
        ? "Inga kända kommande betalningar inom horisonten."
        : `${input.upcomingObligations.length} kända kommande betalningar, vägda efter sannolikhet.`,
  });

  /*
   * Sinking funds: what remains to be saved, not the whole target.
   *
   * Counting the funded part again would demand the same money twice, which is the
   * double-count §39 and §64 both warn about.
   */
  const sinkingRemaining = input.sinkingFunds.reduce<bigint>((total, fund) => {
    const remaining = fund.targetMinor - fund.fundedMinor;
    return total + (remaining > 0n ? remaining : 0n);
  }, 0n);
  components.push({
    key: "SINKING_FUNDS",
    amountMinor: sinkingRemaining,
    reason:
      input.sinkingFunds.length === 0
        ? "Inga öronmärkta sparposter."
        : "Det som återstår att spara till dina öronmärkta poster — redan avsatta pengar räknas inte igen.",
  });

  const beforeMargin = components.reduce<bigint>(
    (total, component) => total + component.amountMinor,
    0n,
  );

  /*
   * Safety margin: the household's own figure when it has set one.
   *
   * This was a hardcoded 5%, which overrode `household_settings.safety_margin_minor`
   * — a number the household had explicitly chosen. The derived 5% remains only as
   * the fallback for a household that has not expressed a preference.
   */
  const configuredMargin = input.policy?.safetyMarginMinor;
  const safetyMargin =
    configuredMargin !== undefined && configuredMargin > 0n
      ? configuredMargin
      : (beforeMargin * 5n) / 100n;
  components.push({
    key: "SAFETY_MARGIN",
    amountMinor: safetyMargin,
    reason:
      configuredMargin !== undefined && configuredMargin > 0n
        ? "Din inställda säkerhetsmarginal."
        : "5 % marginal för att modellen inte kan känna till allt.",
  });

  const requiredMinor = beforeMargin + safetyMargin;

  /*
   * Three levels (§36). Minimum drops the discretionary-facing components;
   * conservative lengthens the reserve. Ranges beat a single number that pretends
   * to a precision the data does not support.
   */
  const minimumMinor = operating + emergency + upcoming;
  const conservativeMinor = requiredMinor + essentialBase;

  const surplus = input.liquidCashMinor - requiredMinor;

  const confidenceReasons: string[] = [];
  let confidence: LiquidityConfidence = "HIGH";
  if (monthsOfHistory < MIN_MONTHS_FOR_CONFIDENCE) {
    confidence = "LOW";
    confidenceReasons.push(
      `Endast ${monthsOfHistory} månaders historik — under ${MIN_MONTHS_FOR_CONFIDENCE} blir uppskattningen preliminär.`,
    );
  } else if (monthsOfHistory < MONTHS_FOR_HIGH_CONFIDENCE) {
    confidence = "MODERATE";
    confidenceReasons.push(
      `${monthsOfHistory} månaders historik — ett helt år ger en säkrare bild av årliga kostnader.`,
    );
  }
  if (input.coveragePercent < 80) {
    confidence = confidence === "HIGH" ? "MODERATE" : "LOW";
    confidenceReasons.push(
      `Täckningen är ${Math.round(input.coveragePercent)} % — konton som saknas kan ändra bilden.`,
    );
  }
  if (input.dataAgeDays > STALE_DATA_DAYS) {
    confidence = confidence === "HIGH" ? "MODERATE" : confidence;
    confidenceReasons.push(
      `Senaste transaktionen är ${input.dataAgeDays} dagar gammal — dagens överskott är mindre säkert.`,
    );
  }
  if (confidenceReasons.length === 0) {
    confidenceReasons.push(
      `${monthsOfHistory} månaders historik och ${Math.round(input.coveragePercent)} % täckning.`,
    );
  }

  return {
    components,
    requiredMinor,
    minimumMinor,
    recommendedMinor: requiredMinor,
    conservativeMinor,
    surplusMinor: surplus > 0n ? surplus : 0n,
    shortfallMinor: surplus < 0n ? -surplus : 0n,
    confidence,
    confidenceReasons,
    policyComparison:
      input.policy?.emergencyFundTargetMinor === undefined
        ? null
        : {
            configuredEmergencyFundMinor: input.policy.emergencyFundTargetMinor,
            derivedEmergencyReserveMinor: emergency,
            differenceMinor: emergency - input.policy.emergencyFundTargetMinor,
          },
    basis: {
      monthsOfHistory,
      essentialMedianMinor: essentialMedian,
      essentialP75Minor: essentialP75,
      essentialP90Minor: essentialP90,
      incomeVolatilityBps,
      expenseVolatilityBps,
      largestIncomeShareBps,
      coveragePercent: input.coveragePercent,
      dataAgeDays: input.dataAgeDays,
    },
  };
}

/** Share of the largest single value in the total, in basis points. */
function largestShareBps(values: readonly bigint[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce<bigint>((sum, value) => sum + value, 0n);
  if (total === 0n) return null;
  const largest = values.reduce<bigint>((max, value) => (value > max ? value : max), 0n);
  return Number((largest * 10_000n) / total);
}

/* ------------------------------------------------------------ stress tests */

export type StressScenario = {
  key:
    | "NO_INCOME_1M"
    | "NO_INCOME_2M"
    | "NO_INCOME_3M"
    | "INCOME_DOWN_30"
    | "WORST_HISTORICAL_MONTH"
    | "SIMULTANEOUS_LARGE_BILLS";
  label: string;
  /** Cash left after the scenario. Negative means the household runs out. */
  remainingCashMinor: bigint;
  survives: boolean;
};

/**
 * Run the household's own history against fixed adverse scenarios (§38).
 *
 * Every scenario uses figures the household has actually produced: its own worst
 * essential month, its own median income. No invented shocks.
 */
export function runStressScenarios(input: {
  liquidCashMinor: bigint;
  monthlyCosts: readonly MonthlyCostObservation[];
  monthlyIncome: readonly IncomeObservation[];
}): StressScenario[] {
  const essentials = input.monthlyCosts.map((month) => month.essentialMinor);
  const essentialMedian = medianMinor(essentials) ?? 0n;
  const worstEssential = percentileMinor(essentials, 100) ?? essentialMedian;
  const incomeMedian = medianMinor(input.monthlyIncome.map((m) => m.amountMinor)) ?? 0n;

  const scenario = (
    key: StressScenario["key"],
    label: string,
    remaining: bigint,
  ): StressScenario => ({
    key,
    label,
    remainingCashMinor: remaining,
    survives: remaining >= 0n,
  });

  return [
    scenario(
      "NO_INCOME_1M",
      "Ingen inkomst i en månad",
      input.liquidCashMinor - essentialMedian,
    ),
    scenario(
      "NO_INCOME_2M",
      "Ingen inkomst i två månader",
      input.liquidCashMinor - essentialMedian * 2n,
    ),
    scenario(
      "NO_INCOME_3M",
      "Ingen inkomst i tre månader",
      input.liquidCashMinor - essentialMedian * 3n,
    ),
    scenario(
      "INCOME_DOWN_30",
      "30 % lägre inkomst i tre månader",
      input.liquidCashMinor - (essentialMedian * 3n - ((incomeMedian * 70n) / 100n) * 3n),
    ),
    scenario(
      "WORST_HISTORICAL_MONTH",
      "Din dyraste månad upprepas utan inkomst",
      input.liquidCashMinor - worstEssential,
    ),
    scenario(
      "SIMULTANEOUS_LARGE_BILLS",
      "Dyraste månaden plus en normal månad samtidigt",
      input.liquidCashMinor - (worstEssential + essentialMedian),
    ),
  ];
}

/* --------------------------------------------------------------- backtest */

export type LiquidityBacktest = {
  monthsTested: number;
  monthsSurvived: number;
  /** Months where the buffer would have dropped below the safety threshold. */
  breaches: Array<{ month: string; shortfallMinor: bigint }>;
};

/**
 * Would the recommended buffer have carried the household through its own past?
 *
 * §65 forbids look-ahead: each month is judged against what the recommendation
 * would have been using only the months *before* it. A model allowed to see the
 * expensive month it is being tested on always passes, which tells nobody
 * anything.
 */
export function backtestLiquidityRecommendation(input: {
  monthlyCosts: readonly MonthlyCostObservation[];
  monthlyIncome: readonly IncomeObservation[];
  /** Minimum months of prior history before a month can be judged. */
  warmupMonths?: number;
}): LiquidityBacktest {
  const warmup = input.warmupMonths ?? 6;
  const breaches: LiquidityBacktest["breaches"] = [];
  let tested = 0;

  for (let i = warmup; i < input.monthlyCosts.length; i++) {
    const priorCosts = input.monthlyCosts.slice(0, i);
    const priorIncome = input.monthlyIncome.slice(0, i);
    const month = input.monthlyCosts[i]!;

    // The recommendation as it would have stood before this month happened.
    const recommendation = calculateLiquidityRequirement({
      monthlyCosts: priorCosts,
      monthlyIncome: priorIncome,
      upcomingObligations: [],
      sinkingFunds: [],
      liquidCashMinor: 0n,
      coveragePercent: 100,
      dataAgeDays: 0,
    });

    tested += 1;
    // The buffer has to absorb that month's essentials with no income at all.
    const shortfall = month.essentialMinor - recommendation.recommendedMinor;
    if (shortfall > 0n) {
      breaches.push({ month: month.month, shortfallMinor: shortfall });
    }
  }

  return {
    monthsTested: tested,
    monthsSurvived: tested - breaches.length,
    breaches,
  };
}

/* --------------------------------------------------------- savings target */

export type SavingsAllocation = {
  key:
    | "NEAR_TERM_OBLIGATIONS"
    | "OPERATING_CASH"
    | "EMERGENCY_RESERVE_DEFICIT"
    | "SINKING_FUNDS"
    | "PRIORITY_GOALS"
    | "DEBT_STRATEGY"
    | "INVESTMENT_CONTRIBUTION"
    | "DISCRETIONARY_SURPLUS";
  label: string;
  amountMinor: bigint;
};

export type SavingsTarget = {
  normalMonthlySurplusMinor: bigint;
  allocations: SavingsAllocation[];
  totalAllocatedMinor: bigint;
  /** True when the household cannot fund even its obligations this month. */
  cashflowNegative: boolean;
  notes: string[];
};

/**
 * Allocate a normal month's surplus in policy order (§41).
 *
 * A waterfall: each level takes what it needs from what is left, and nothing is
 * allocated twice. When the surplus does not reach a level, that level gets
 * nothing rather than a proportional share — a half-funded emergency reserve is a
 * clearer statement of the situation than eight partially funded priorities.
 *
 * Nothing here moves money. It is a recommendation.
 */
export function calculateSavingsTarget(input: {
  medianIncomeMinor: bigint;
  medianTotalCostMinor: bigint;
  /** From the liquidity engine. */
  reserveShortfallMinor: bigint;
  operatingCashShortfallMinor: bigint;
  nearTermObligationsMinor: bigint;
  sinkingFundMonthlyMinor: bigint;
  priorityGoalMonthlyMinor: bigint;
  debtStrategyMonthlyMinor: bigint;
  /** How many months to spread a reserve shortfall over. */
  reserveHorizonMonths?: number;
}): SavingsTarget {
  const horizon = BigInt(Math.max(1, input.reserveHorizonMonths ?? 12));
  const surplus = input.medianIncomeMinor - input.medianTotalCostMinor;
  const notes: string[] = [];

  if (surplus <= 0n) {
    notes.push(
      "Utgifterna är i nivå med eller över inkomsten i en normal månad — modellen rekommenderar inget sparande förrän det är åtgärdat.",
    );
    return {
      normalMonthlySurplusMinor: surplus,
      allocations: [],
      totalAllocatedMinor: 0n,
      cashflowNegative: true,
      notes,
    };
  }

  let remaining = surplus;
  const allocations: SavingsAllocation[] = [];
  const take = (
    key: SavingsAllocation["key"],
    label: string,
    wanted: bigint,
  ): void => {
    if (wanted <= 0n || remaining <= 0n) return;
    const amount = wanted < remaining ? wanted : remaining;
    allocations.push({ key, label, amountMinor: amount });
    remaining -= amount;
  };

  take("NEAR_TERM_OBLIGATIONS", "Nära förestående betalningar", input.nearTermObligationsMinor);
  take("OPERATING_CASH", "Löpande kassa", input.operatingCashShortfallMinor);
  take(
    "EMERGENCY_RESERVE_DEFICIT",
    "Buffert som saknas",
    input.reserveShortfallMinor / horizon,
  );
  take("SINKING_FUNDS", "Öronmärkta poster", input.sinkingFundMonthlyMinor);
  take("PRIORITY_GOALS", "Prioriterade mål", input.priorityGoalMonthlyMinor);
  take("DEBT_STRATEGY", "Extra amortering", input.debtStrategyMonthlyMinor);

  // Whatever survives the waterfall is investable, and the rest is simply free.
  if (remaining > 0n) {
    const investment = (remaining * 70n) / 100n;
    take("INVESTMENT_CONTRIBUTION", "Investering", investment);
  }
  if (remaining > 0n) {
    take("DISCRETIONARY_SURPLUS", "Fritt överskott", remaining);
  }

  const totalAllocated = allocations.reduce<bigint>(
    (total, allocation) => total + allocation.amountMinor,
    0n,
  );
  if (input.reserveShortfallMinor > 0n) {
    notes.push(
      `Bufferten saknar ett belopp som fördelas över ${horizon} månader i den här rekommendationen.`,
    );
  }

  return {
    normalMonthlySurplusMinor: surplus,
    allocations,
    totalAllocatedMinor: totalAllocated,
    cashflowNegative: false,
    notes,
  };
}

/* --------------------------------------------------------------- runway */

export type CashRunway = {
  normalMonths: number | null;
  essentialOnlyMonths: number | null;
  incomeReducedMonths: number | null;
};

/**
 * How long the cash lasts under three assumptions (§45).
 *
 * One decimal, because a runway is an estimate and quoting it to the day would be
 * false precision.
 */
export function calculateCashRunway(input: {
  liquidCashMinor: bigint;
  medianTotalCostMinor: bigint;
  medianEssentialCostMinor: bigint;
  medianIncomeMinor: bigint;
}): CashRunway {
  const months = (cash: bigint, burn: bigint): number | null => {
    if (burn <= 0n) return null;
    return Number((cash * 10n) / burn) / 10;
  };
  // With income 30% lower, the shortfall is what the cash has to cover.
  const reducedIncome = (input.medianIncomeMinor * 70n) / 100n;
  const reducedBurn = input.medianTotalCostMinor - reducedIncome;
  return {
    normalMonths: months(input.liquidCashMinor, input.medianTotalCostMinor),
    essentialOnlyMonths: months(input.liquidCashMinor, input.medianEssentialCostMinor),
    incomeReducedMonths:
      reducedBurn <= 0n ? null : months(input.liquidCashMinor, reducedBurn),
  };
}

/* ------------------------------------------------------------ resilience */

export type ResilienceLevel = "STRONG" | "MODERATE" | "WEAK" | "UNKNOWN";

export type FinancialResilience = {
  dimensions: Array<{
    key:
      | "LIQUIDITY"
      | "INCOME_STABILITY"
      | "EXPENSE_VOLATILITY"
      | "FIXED_COSTS"
      | "DEBT_SERVICING"
      | "RESERVE_ADEQUACY"
      | "DATA_COVERAGE";
    label: string;
    level: ResilienceLevel;
    detail: string;
  }>;
};

/**
 * Resilience across dimensions, with no single score (§46).
 *
 * A composite number would let a strong cash position hide a fragile income, and
 * the household would never know which one to act on.
 */
export function assessFinancialResilience(input: {
  requirement: LiquidityRequirement;
  runway: CashRunway;
  fixedCostShareBps: number | null;
  debtServiceShareBps: number | null;
}): FinancialResilience {
  const { requirement } = input;
  const level = (
    good: boolean,
    moderate: boolean,
    known = true,
  ): ResilienceLevel =>
    !known ? "UNKNOWN" : good ? "STRONG" : moderate ? "MODERATE" : "WEAK";

  const incomeVolatility = requirement.basis.incomeVolatilityBps;
  const expenseVolatility = requirement.basis.expenseVolatilityBps;

  return {
    dimensions: [
      {
        key: "LIQUIDITY",
        label: "Likviditet",
        level: level(
          requirement.shortfallMinor === 0n && requirement.surplusMinor > 0n,
          requirement.shortfallMinor === 0n,
        ),
        detail:
          requirement.shortfallMinor === 0n
            ? "Du har minst den likviditet modellen rekommenderar."
            : "Du ligger under den rekommenderade nivån.",
      },
      {
        key: "INCOME_STABILITY",
        label: "Inkomststabilitet",
        level: level(
          (incomeVolatility ?? 9999) < 1000,
          (incomeVolatility ?? 9999) < 2500,
          incomeVolatility !== null,
        ),
        detail:
          incomeVolatility === null
            ? "För lite inkomsthistorik att bedöma."
            : `Inkomsten varierar ${(incomeVolatility / 100).toFixed(0)} % mellan månaderna.`,
      },
      {
        key: "EXPENSE_VOLATILITY",
        label: "Kostnadsvariation",
        level: level(
          (expenseVolatility ?? 9999) < 1000,
          (expenseVolatility ?? 9999) < 2500,
          expenseVolatility !== null,
        ),
        detail:
          expenseVolatility === null
            ? "För lite kostnadshistorik att bedöma."
            : `Nödvändiga kostnader varierar ${(expenseVolatility / 100).toFixed(0)} %.`,
      },
      {
        key: "FIXED_COSTS",
        label: "Fasta kostnader",
        level: level(
          (input.fixedCostShareBps ?? 9999) < 5000,
          (input.fixedCostShareBps ?? 9999) < 7000,
          input.fixedCostShareBps !== null,
        ),
        detail:
          input.fixedCostShareBps === null
            ? "Andelen fasta kostnader är inte beräknad."
            : `${(input.fixedCostShareBps / 100).toFixed(0)} % av utgifterna är bundna.`,
      },
      {
        key: "DEBT_SERVICING",
        label: "Skuldbetalningar",
        level: level(
          (input.debtServiceShareBps ?? 0) < 2000,
          (input.debtServiceShareBps ?? 0) < 3500,
          input.debtServiceShareBps !== null,
        ),
        detail:
          input.debtServiceShareBps === null
            ? "Inga skuldbetalningar identifierade."
            : `${(input.debtServiceShareBps / 100).toFixed(0)} % av inkomsten går till skulder.`,
      },
      {
        key: "RESERVE_ADEQUACY",
        label: "Buffertens storlek",
        level: level(
          (input.runway.essentialOnlyMonths ?? 0) >= 6,
          (input.runway.essentialOnlyMonths ?? 0) >= 3,
          input.runway.essentialOnlyMonths !== null,
        ),
        detail:
          input.runway.essentialOnlyMonths === null
            ? "Kunde inte beräknas."
            : `Räcker ${input.runway.essentialOnlyMonths} månader vid enbart nödvändiga kostnader.`,
      },
      {
        key: "DATA_COVERAGE",
        label: "Datatäckning",
        level: level(
          requirement.basis.coveragePercent >= 90 &&
            requirement.basis.monthsOfHistory >= 12,
          requirement.basis.coveragePercent >= 70,
        ),
        detail: `${Math.round(requirement.basis.coveragePercent)} % täckning och ${requirement.basis.monthsOfHistory} månaders historik.`,
      },
    ],
  };
}
