import { Inject, Injectable } from "@nestjs/common";
import {
  assessFinancialResilience,
  backtestLiquidityRecommendation,
  calculateAllBaselines,
  calculateCashRunway,
  calculateLiquidityRequirement,
  calculateSavingsTarget,
  medianMinor,
  runStressScenarios,
} from "@ffos/financial-engine";
import { FinancialIntelligenceInputService } from "./financial-intelligence-input.service";

/**
 * Runs the deterministic engine against a real household.
 *
 * Every number below comes from `packages/financial-engine`. This service reads,
 * shapes and hands over; it does not compute money itself, and it does not write
 * anything. Keeping it that thin is what lets the engine's 190 tests stand as
 * evidence about the product rather than about a test fixture.
 */
@Injectable()
export class FinancialIntelligenceService {
  constructor(
    @Inject(FinancialIntelligenceInputService)
    private readonly input: FinancialIntelligenceInputService,
  ) {}

  /**
   * The household's liquidity requirement, and everything that explains it.
   *
   * Serialised with bigints as strings, because JSON cannot carry a bigint and
   * converting to Number would reintroduce the float this codebase has spent
   * considerable effort keeping out.
   */
  async liquidity(userId: string, householdId: string) {
    const input = await this.input.build(userId, householdId);
    const { series, policy } = input;

    const requirement = calculateLiquidityRequirement({
      monthlyCosts: series.costs,
      monthlyIncome: series.income,
      upcomingObligations: input.upcomingObligations,
      sinkingFunds: input.sinkingFunds,
      liquidCashMinor: input.liquidCashMinor,
      coveragePercent: input.coveragePercent,
      dataAgeDays: input.dataAgeDays,
      policy,
    });

    const essentials = series.costs.map((month) => month.essentialMinor);
    const totals = series.costs.map(
      (month) =>
        month.essentialMinor + month.semiDiscretionaryMinor + month.discretionaryMinor,
    );
    const incomes = series.income.map((month) => month.amountMinor);

    const runway = calculateCashRunway({
      liquidCashMinor: input.liquidCashMinor,
      medianTotalCostMinor: medianMinor(totals) ?? 0n,
      medianEssentialCostMinor: medianMinor(essentials) ?? 0n,
      medianIncomeMinor: medianMinor(incomes) ?? 0n,
    });

    const stress = runStressScenarios({
      liquidCashMinor: input.liquidCashMinor,
      monthlyCosts: series.costs,
      monthlyIncome: series.income,
    });

    const backtest = backtestLiquidityRecommendation({
      monthlyCosts: series.costs,
      monthlyIncome: series.income,
    });

    // Fixed-cost share is approximated by the essential share until recurring
    // detection is persisted; labelled as such rather than presented as the
    // fixed-cost ratio it is not yet.
    const medianEssential = medianMinor(essentials);
    const medianTotal = medianMinor(totals);
    const essentialShareBps =
      medianEssential === null || medianTotal === null || medianTotal === 0n
        ? null
        : Number((medianEssential * 10_000n) / medianTotal);

    const resilience = assessFinancialResilience({
      requirement,
      runway,
      fixedCostShareBps: essentialShareBps,
      debtServiceShareBps: null,
    });

    return {
      asOf: input.asOf,
      currency: input.currency,
      requirement: {
        minimumMinor: requirement.minimumMinor.toString(),
        recommendedMinor: requirement.recommendedMinor.toString(),
        conservativeMinor: requirement.conservativeMinor.toString(),
        surplusMinor: requirement.surplusMinor.toString(),
        shortfallMinor: requirement.shortfallMinor.toString(),
        confidence: requirement.confidence,
        confidenceReasons: requirement.confidenceReasons,
        components: requirement.components.map((component) => ({
          key: component.key,
          amountMinor: component.amountMinor.toString(),
          reason: component.reason,
        })),
      },
      liquidCashMinor: input.liquidCashMinor.toString(),
      /**
       * The household's own target beside the derived reserve (DEL 13). Neither
       * replaces the other: showing both is what lets a household see its target
       * sitting below what its own costs suggest.
       */
      policyComparison:
        requirement.policyComparison === null
          ? null
          : {
              configuredEmergencyFundMinor:
                requirement.policyComparison.configuredEmergencyFundMinor.toString(),
              derivedEmergencyReserveMinor:
                requirement.policyComparison.derivedEmergencyReserveMinor.toString(),
              differenceMinor: requirement.policyComparison.differenceMinor.toString(),
            },
      runway,
      stress: stress.map((scenario) => ({
        key: scenario.key,
        label: scenario.label,
        remainingCashMinor: scenario.remainingCashMinor.toString(),
        survives: scenario.survives,
      })),
      backtest: {
        monthsTested: backtest.monthsTested,
        monthsSurvived: backtest.monthsSurvived,
        breachCount: backtest.breaches.length,
        largestBreachMinor:
          backtest.breaches.length === 0
            ? null
            : backtest.breaches
                .reduce<bigint>(
                  (max, breach) =>
                    breach.shortfallMinor > max ? breach.shortfallMinor : max,
                  0n,
                )
                .toString(),
        breaches: backtest.breaches.slice(0, 12).map((breach) => ({
          month: breach.month,
          shortfallMinor: breach.shortfallMinor.toString(),
        })),
      },
      resilience,
      basis: {
        monthsOfHistory: requirement.basis.monthsOfHistory,
        firstMonth: input.provenance.firstMonth,
        lastMonth: input.provenance.lastMonth,
        essentialMedianMinor: requirement.basis.essentialMedianMinor?.toString() ?? null,
        essentialP75Minor: requirement.basis.essentialP75Minor?.toString() ?? null,
        essentialP90Minor: requirement.basis.essentialP90Minor?.toString() ?? null,
        incomeVolatilityBps: requirement.basis.incomeVolatilityBps,
        expenseVolatilityBps: requirement.basis.expenseVolatilityBps,
        largestIncomeShareBps: requirement.basis.largestIncomeShareBps,
        coveragePercent: requirement.basis.coveragePercent,
        dataAgeDays: requirement.basis.dataAgeDays,
        categorisedShareBps: input.provenance.categorisedShareBps,
        /** How much of the essential total rests on spending nobody has classified. */
        unknownNecessityShareBps: input.provenance.unknownNecessityShareBps,
        emptyMonths: series.emptyMonths.length,
      },
    };
  }

  /** Spending baselines over every window the history supports (DEL 9). */
  async baselines(userId: string, householdId: string) {
    const input = await this.input.build(userId, householdId);
    const totals = input.series.costs.map((month) => ({
      month: month.month,
      amountMinor:
        month.essentialMinor + month.semiDiscretionaryMinor + month.discretionaryMinor,
    }));
    const all = calculateAllBaselines(totals);
    const serialise = (baseline: (typeof all)["3m"]) => ({
      window: baseline.window,
      monthsObserved: baseline.monthsObserved,
      insufficient: baseline.insufficient,
      medianMinor: baseline.medianMinor?.toString() ?? null,
      trimmedMeanMinor: baseline.trimmedMeanMinor?.toString() ?? null,
      p25Minor: baseline.p25Minor?.toString() ?? null,
      p75Minor: baseline.p75Minor?.toString() ?? null,
      p90Minor: baseline.p90Minor?.toString() ?? null,
    });
    return {
      asOf: input.asOf,
      currency: input.currency,
      windows: {
        "3m": serialise(all["3m"]),
        "6m": serialise(all["6m"]),
        "12m": serialise(all["12m"]),
        "24m": serialise(all["24m"]),
      },
      monthsOfHistory: input.provenance.monthsOfHistory,
    };
  }

  /**
   * The monthly savings recommendation (DEL 20).
   *
   * Sized on the household's normal month rather than on the month in progress,
   * and it recommends nothing when a normal month does not balance.
   */
  async savingsTarget(userId: string, householdId: string) {
    const input = await this.input.build(userId, householdId);
    const { series } = input;

    const requirement = calculateLiquidityRequirement({
      monthlyCosts: series.costs,
      monthlyIncome: series.income,
      upcomingObligations: input.upcomingObligations,
      sinkingFunds: input.sinkingFunds,
      liquidCashMinor: input.liquidCashMinor,
      coveragePercent: input.coveragePercent,
      dataAgeDays: input.dataAgeDays,
      policy: input.policy,
    });

    const totals = series.costs.map(
      (month) =>
        month.essentialMinor + month.semiDiscretionaryMinor + month.discretionaryMinor,
    );
    const operating = requirement.components.find((c) => c.key === "OPERATING_CASH");
    const operatingShortfall =
      operating && input.liquidCashMinor < operating.amountMinor
        ? operating.amountMinor - input.liquidCashMinor
        : 0n;

    const sinkingMonthly = input.sinkingFunds.reduce<bigint>((total, fund) => {
      const remaining = fund.targetMinor - fund.fundedMinor;
      // Spread what remains over a year, which is the horizon the waterfall uses.
      return total + (remaining > 0n ? remaining / 12n : 0n);
    }, 0n);

    const target = calculateSavingsTarget({
      medianIncomeMinor: medianMinor(series.income.map((m) => m.amountMinor)) ?? 0n,
      medianTotalCostMinor: medianMinor(totals) ?? 0n,
      reserveShortfallMinor: requirement.shortfallMinor,
      operatingCashShortfallMinor: operatingShortfall,
      nearTermObligationsMinor: input.upcomingObligations.reduce<bigint>(
        (total, obligation) => total + obligation.amountMinor,
        0n,
      ),
      sinkingFundMonthlyMinor: sinkingMonthly,
      priorityGoalMonthlyMinor: 0n,
      debtStrategyMonthlyMinor: 0n,
    });

    return {
      asOf: input.asOf,
      currency: input.currency,
      normalMonthlySurplusMinor: target.normalMonthlySurplusMinor.toString(),
      cashflowNegative: target.cashflowNegative,
      totalAllocatedMinor: target.totalAllocatedMinor.toString(),
      allocations: target.allocations.map((allocation) => ({
        key: allocation.key,
        label: allocation.label,
        amountMinor: allocation.amountMinor.toString(),
      })),
      notes: target.notes,
      /** The same liquidity model, not a second formula (DEL 21). */
      availableSurplusMinor: requirement.surplusMinor.toString(),
      shortfallMinor: requirement.shortfallMinor.toString(),
      confidence: requirement.confidence,
    };
  }
}
