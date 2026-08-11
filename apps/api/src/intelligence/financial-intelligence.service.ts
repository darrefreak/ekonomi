import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import {
  assessFinancialResilience,
  backtestLiquidityRecommendation,
  calculateAllBaselines,
  calculateCashRunway,
  calculateCategoryTrend,
  calculateLiquidityRequirement,
  calculateSavingsTarget,
  comparePeriodDrivers,
  medianMinor,
  runStressScenarios,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import { categories, merchants, sourceTransactions } from "../db/schema-economic";
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

    /*
     * Months with no recorded activity are dropped before the engine sees them.
     *
     * The series spans first activity to last, and a month inside it with nothing
     * recorded is stored as a real zero. That is right for a household that
     * genuinely spent nothing, and wrong for one whose history is sparse: with
     * three populated months inside a fifty-two-month span, the median essential
     * cost is zero and the page then presents a confident range built on nothing.
     * Observed on a household with 52 months of span and a median of 0 kr.
     *
     * A month is kept only if it recorded something. The count of dropped months is
     * carried into the confidence reasons, so sparse history reads as sparse rather
     * than as a household that lives on nothing.
     */
    const populated = series.costs.filter(
      (month, index) =>
        month.essentialMinor > 0n ||
        month.semiDiscretionaryMinor > 0n ||
        month.discretionaryMinor > 0n ||
        (series.income[index]?.amountMinor ?? 0n) > 0n,
    );
    const populatedIncome = series.income.filter((_, index) => {
      const cost = series.costs[index];
      if (!cost) return false;
      return (
        cost.essentialMinor > 0n ||
        cost.semiDiscretionaryMinor > 0n ||
        cost.discretionaryMinor > 0n ||
        series.income[index]!.amountMinor > 0n
      );
    });
    const droppedMonths = series.costs.length - populated.length;

    const requirement = calculateLiquidityRequirement({
      monthlyCosts: populated,
      monthlyIncome: populatedIncome,
      upcomingObligations: input.upcomingObligations,
      sinkingFunds: input.sinkingFunds,
      liquidCashMinor: input.liquidCashMinor,
      coveragePercent: input.coveragePercent,
      dataAgeDays: input.dataAgeDays,
      policy,
    });

    const confidenceReasons = [...requirement.confidenceReasons];
    if (droppedMonths > 0) {
      confidenceReasons.push(
        `${droppedMonths} av ${series.costs.length} månader i perioden saknar registrerad aktivitet och räknas inte som månader du levde på noll.`,
      );
    }

    const essentials = populated.map((month) => month.essentialMinor);
    const totals = populated.map(
      (month) =>
        month.essentialMinor + month.semiDiscretionaryMinor + month.discretionaryMinor,
    );
    const incomes = populatedIncome.map((month) => month.amountMinor);

    const runway = calculateCashRunway({
      liquidCashMinor: input.liquidCashMinor,
      medianTotalCostMinor: medianMinor(totals) ?? 0n,
      medianEssentialCostMinor: medianMinor(essentials) ?? 0n,
      medianIncomeMinor: medianMinor(incomes) ?? 0n,
    });

    const stress = runStressScenarios({
      liquidCashMinor: input.liquidCashMinor,
      monthlyCosts: populated,
      monthlyIncome: populatedIncome,
    });

    const backtest = backtestLiquidityRecommendation({
      monthlyCosts: populated,
      monthlyIncome: populatedIncome,
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
        confidenceReasons,
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
        emptyMonths: droppedMonths,
      },
    };
  }

  /** Spending baselines over every window the history supports (DEL 9). */
  async baselines(userId: string, householdId: string) {
    const input = await this.input.build(userId, householdId);
    // Same reasoning as the liquidity path: a month with nothing recorded is not
    // evidence that the household spent nothing that month.
    const totals = input.series.costs
      .map((month) => ({
        month: month.month,
        amountMinor:
          month.essentialMinor + month.semiDiscretionaryMinor + month.discretionaryMinor,
      }))
      .filter((month) => month.amountMinor > 0n);
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

  /**
   * Category trends against each category's own 12-month baseline (§46).
   *
   * The comparison the advisor's "why did spending increase" answer rests on:
   * per-category monthly totals from the ledger's transactions, trend maths
   * from the engine, nothing invented in between.
   */
  async categoryTrends(userId: string, householdId: string) {
    const input = await this.input.build(userId, householdId);
    const db = getDb();
    const currentMonth = lastCompletedMonth(input.asOf);

    const rows = await db
      .select({
        month: sql<string>`to_char(${sourceTransactions.bookingDate}, 'YYYY-MM')`,
        categoryKey: categories.key,
        categoryName: categories.name,
        amountMinor: sql<string>`sum(abs(${sourceTransactions.amountMinor}))::text`,
      })
      .from(sourceTransactions)
      .innerJoin(categories, eq(sourceTransactions.categoryId, categories.id))
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          sql`${sourceTransactions.amountMinor} < 0`,
          sql`${sourceTransactions.bookingDate} >= (${input.asOf}::date - interval '15 months')`,
        ),
      )
      .groupBy(
        sql`to_char(${sourceTransactions.bookingDate}, 'YYYY-MM')`,
        categories.key,
        categories.name,
      );

    const nameByKey = new Map(rows.map((row) => [row.categoryKey, row.categoryName]));
    const points = rows.map((row) => ({
      month: row.month,
      categoryKey: row.categoryKey,
      amountMinor: BigInt(row.amountMinor),
    }));

    const items = [...new Set(points.map((point) => point.categoryKey))]
      .map((key) => {
        const trend = calculateCategoryTrend({
          categoryKey: key,
          points,
          currentMonth,
        });
        return {
          categoryKey: key,
          categoryName: nameByKey.get(key) ?? key,
          month: currentMonth,
          thisMonthMinor: trend.thisMonthMinor.toString(),
          average12mMinor: trend.average12mMinor?.toString() ?? null,
          changeVsBaselineMinor: trend.changeVsBaselineMinor?.toString() ?? null,
          changeVsBaselinePercent: trend.changeVsBaselinePercent,
          changeVsPreviousMonthPercent: trend.changeVsPreviousMonthPercent,
          yearOverYearPercent: trend.yearOverYearPercent,
          direction: trend.direction,
        };
      })
      .filter((item) => item.average12mMinor !== null)
      .sort(
        (a, b) =>
          Math.abs(b.changeVsBaselinePercent ?? 0) -
          Math.abs(a.changeVsBaselinePercent ?? 0),
      );

    return { asOf: input.asOf, currency: input.currency, month: currentMonth, items };
  }

  /** Merchant spending trends: this completed month vs the merchant's 12m average. */
  async merchantTrends(userId: string, householdId: string) {
    const input = await this.input.build(userId, householdId);
    const db = getDb();
    const currentMonth = lastCompletedMonth(input.asOf);

    const rows = await db
      .select({
        month: sql<string>`to_char(${sourceTransactions.bookingDate}, 'YYYY-MM')`,
        merchantName: merchants.canonicalName,
        amountMinor: sql<string>`sum(abs(${sourceTransactions.amountMinor}))::text`,
      })
      .from(sourceTransactions)
      .innerJoin(merchants, eq(sourceTransactions.merchantId, merchants.id))
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          sql`${sourceTransactions.amountMinor} < 0`,
          sql`${sourceTransactions.bookingDate} >= (${input.asOf}::date - interval '13 months')`,
        ),
      )
      .groupBy(
        sql`to_char(${sourceTransactions.bookingDate}, 'YYYY-MM')`,
        merchants.canonicalName,
      );

    const byMerchant = new Map<string, Array<{ month: string; amountMinor: bigint }>>();
    for (const row of rows) {
      const list = byMerchant.get(row.merchantName) ?? [];
      list.push({ month: row.month, amountMinor: BigInt(row.amountMinor) });
      byMerchant.set(row.merchantName, list);
    }

    const items = [...byMerchant.entries()]
      .map(([merchantName, list]) => {
        const thisMonth =
          list.find((entry) => entry.month === currentMonth)?.amountMinor ?? 0n;
        const history = list.filter((entry) => entry.month < currentMonth);
        const total = history.reduce((sum, entry) => sum + entry.amountMinor, 0n);
        const average = history.length > 0 ? total / BigInt(history.length) : null;
        const changePercent =
          average != null && average > 0n
            ? Number(((thisMonth - average) * 1000n) / average) / 10
            : null;
        return {
          merchantName,
          month: currentMonth,
          thisMonthMinor: thisMonth.toString(),
          averageMinor: average?.toString() ?? null,
          monthsObserved: history.length,
          changeVsAveragePercent: changePercent,
        };
      })
      .filter((item) => item.averageMinor !== null)
      .sort(
        (a, b) =>
          Math.abs(b.changeVsAveragePercent ?? 0) - Math.abs(a.changeVsAveragePercent ?? 0),
      )
      .slice(0, 10);

    return { asOf: input.asOf, currency: input.currency, month: currentMonth, items };
  }

  /**
   * What changed between the last two completed months (§46, §47): income,
   * expenses, and the category/merchant drivers behind the difference.
   */
  async periodChangeDrivers(userId: string, householdId: string) {
    const input = await this.input.build(userId, householdId);
    const db = getDb();
    const after = lastCompletedMonth(input.asOf);
    const before = monthBefore(after);

    const loadPeriod = async (month: string) => {
      const rows = await db
        .select({
          amountMinor: sql<string>`sum(${sourceTransactions.amountMinor})::text`,
          isInflow: sql<boolean>`${sourceTransactions.amountMinor} >= 0`,
          categoryKey: categories.key,
          merchantName: merchants.canonicalName,
        })
        .from(sourceTransactions)
        .leftJoin(categories, eq(sourceTransactions.categoryId, categories.id))
        .leftJoin(merchants, eq(sourceTransactions.merchantId, merchants.id))
        .where(
          and(
            eq(sourceTransactions.householdId, householdId),
            sql`to_char(${sourceTransactions.bookingDate}, 'YYYY-MM') = ${month}`,
          ),
        )
        .groupBy(
          sql`${sourceTransactions.amountMinor} >= 0`,
          categories.key,
          merchants.canonicalName,
        );

      let incomeMinor = 0n;
      let expenseMinor = 0n;
      const byCategory = new Map<string, bigint>();
      const byMerchant = new Map<string, bigint>();
      for (const row of rows) {
        const amount = BigInt(row.amountMinor);
        if (row.isInflow) {
          incomeMinor += amount;
          continue;
        }
        const magnitude = -amount;
        expenseMinor += magnitude;
        const categoryKey = row.categoryKey ?? "uncategorised";
        byCategory.set(categoryKey, (byCategory.get(categoryKey) ?? 0n) + magnitude);
        if (row.merchantName) {
          byMerchant.set(
            row.merchantName,
            (byMerchant.get(row.merchantName) ?? 0n) + magnitude,
          );
        }
      }
      return { incomeMinor, expenseMinor, byCategory, byMerchant };
    };

    const [beforePeriod, afterPeriod] = await Promise.all([
      loadPeriod(before),
      loadPeriod(after),
    ]);
    const comparison = comparePeriodDrivers({
      before: beforePeriod,
      after: afterPeriod,
    });

    return {
      asOf: input.asOf,
      currency: input.currency,
      beforeMonth: before,
      afterMonth: after,
      incomeChangeMinor: comparison.incomeChangeMinor.toString(),
      expenseChangeMinor: comparison.expenseChangeMinor.toString(),
      savingsChangeMinor: comparison.savingsChangeMinor.toString(),
      categoryDrivers: comparison.categoryDrivers.slice(0, 8).map(serializeDriver),
      merchantDrivers: comparison.merchantDrivers.slice(0, 8).map(serializeDriver),
    };
  }
}

function serializeDriver(driver: {
  key: string;
  changeMinor: bigint;
  contributionBps: number | null;
}) {
  return {
    key: driver.key,
    changeMinor: driver.changeMinor.toString(),
    contributionBps: driver.contributionBps,
  };
}

/** The last completed month before asOf, `YYYY-MM`. */
function lastCompletedMonth(asOf: string): string {
  return monthBefore(asOf.slice(0, 7));
}

function monthBefore(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const index = year! * 12 + (m! - 1) - 1;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}
