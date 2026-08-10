import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessFinancialResilience,
  backtestLiquidityRecommendation,
  calculateCashRunway,
  calculateLiquidityRequirement,
  calculateSavingsTarget,
  runStressScenarios,
  type LiquidityInput,
  type MonthlyCostObservation,
} from "./liquidity";

/**
 * The liquidity engine, tested against synthetic households (§63) and against
 * properties that must hold whatever the numbers are (§64).
 *
 * The property tests matter more than the scenarios: a household can be unusual,
 * but "adding an obligation must never reduce the money you need" has to hold for
 * every household or the model is not describing anything.
 */

/** Build n months of costs, with optional per-month overrides. */
function months(
  count: number,
  essential: bigint,
  options: {
    semi?: bigint;
    discretionary?: bigint;
    overrides?: Record<number, Partial<MonthlyCostObservation>>;
  } = {},
): MonthlyCostObservation[] {
  return Array.from({ length: count }, (_, index) => ({
    month: `2025-${String((index % 12) + 1).padStart(2, "0")}`,
    essentialMinor: essential,
    semiDiscretionaryMinor: options.semi ?? 0n,
    discretionaryMinor: options.discretionary ?? 0n,
    ...(options.overrides?.[index] ?? {}),
  }));
}

function income(count: number, amount: bigint): Array<{ month: string; amountMinor: bigint }> {
  return Array.from({ length: count }, (_, index) => ({
    month: `2025-${String((index % 12) + 1).padStart(2, "0")}`,
    amountMinor: amount,
  }));
}

/** A stable household: 24 months, flat costs, flat income, healthy cash. */
function stableHousehold(overrides: Partial<LiquidityInput> = {}): LiquidityInput {
  return {
    monthlyCosts: months(24, 3_840_000n, { semi: 500_000n, discretionary: 800_000n }),
    monthlyIncome: income(24, 6_800_000n),
    upcomingObligations: [],
    sinkingFunds: [],
    liquidCashMinor: 28_400_000n,
    coveragePercent: 96,
    dataAgeDays: 2,
    ...overrides,
  };
}

describe("liquidity requirement", () => {
  it("reports every component, and they sum to the total", () => {
    const result = calculateLiquidityRequirement(stableHousehold());
    assert.equal(result.components.length, 8, "all eight components are reported (§31)");
    const summed = result.components.reduce<bigint>((t, c) => t + c.amountMinor, 0n);
    assert.equal(summed, result.requiredMinor, "the total is the sum, not a separate number");
    // No magic number: every component carries a reason.
    for (const component of result.components) {
      assert.ok(component.reason.length > 10, `${component.key} must explain itself`);
    }
  });

  it("does not apply a universal three-months rule", () => {
    // Two households with identical essentials but different income stability must
    // not receive the same recommendation.
    const steady = calculateLiquidityRequirement(stableHousehold());
    const volatile = calculateLiquidityRequirement(
      stableHousehold({
        monthlyIncome: income(24, 6_800_000n).map((month, index) => ({
          ...month,
          // Swings between a third and double the median.
          amountMinor: index % 3 === 0 ? 2_200_000n : 13_000_000n,
        })),
      }),
    );
    assert.ok(
      volatile.requiredMinor > steady.requiredMinor,
      "irregular income must require more, not the same",
    );
  });

  it("grades minimum, recommended and conservative in order", () => {
    const result = calculateLiquidityRequirement(stableHousehold());
    assert.ok(result.minimumMinor <= result.recommendedMinor);
    assert.ok(result.recommendedMinor <= result.conservativeMinor);
  });

  it("states a shortfall rather than a negative surplus", () => {
    const poor = calculateLiquidityRequirement(
      stableHousehold({ liquidCashMinor: 1_000_000n }),
    );
    assert.equal(poor.surplusMinor, 0n);
    assert.ok(poor.shortfallMinor > 0n);

    const rich = calculateLiquidityRequirement(
      stableHousehold({ liquidCashMinor: 90_000_000n }),
    );
    assert.equal(rich.shortfallMinor, 0n);
    assert.ok(rich.surplusMinor > 0n);
  });

  it("lowers confidence for short history, thin coverage and stale data (§52, §53)", () => {
    const short = calculateLiquidityRequirement(
      stableHousehold({ monthlyCosts: months(3, 3_840_000n), monthlyIncome: income(3, 6_800_000n) }),
    );
    assert.equal(short.confidence, "LOW");
    assert.match(short.confidenceReasons.join(" "), /3 månaders historik/);

    const thin = calculateLiquidityRequirement(stableHousehold({ coveragePercent: 45 }));
    assert.notEqual(thin.confidence, "HIGH");
    assert.match(thin.confidenceReasons.join(" "), /Täckningen/);

    const stale = calculateLiquidityRequirement(stableHousehold({ dataAgeDays: 60 }));
    assert.match(stale.confidenceReasons.join(" "), /60 dagar gammal/);

    const good = calculateLiquidityRequirement(stableHousehold());
    assert.equal(good.confidence, "HIGH");
  });

  it("survives a household with no history at all", () => {
    const empty = calculateLiquidityRequirement({
      monthlyCosts: [],
      monthlyIncome: [],
      upcomingObligations: [],
      sinkingFunds: [],
      liquidCashMinor: 0n,
      coveragePercent: 0,
      dataAgeDays: 0,
    });
    assert.equal(empty.confidence, "LOW");
    assert.equal(empty.requiredMinor, 0n, "no history means no claim, not a guess");
  });
});

describe("the household's own policy", () => {
  it("uses the configured safety margin instead of the model's 5 %", () => {
    const derived = calculateLiquidityRequirement(stableHousehold());
    const marginOf = (r: ReturnType<typeof calculateLiquidityRequirement>) =>
      r.components.find((c) => c.key === "SAFETY_MARGIN")!;

    const configured = calculateLiquidityRequirement(
      stableHousehold({ policy: { safetyMarginMinor: 2_000_000n } }),
    );
    assert.equal(marginOf(configured).amountMinor, 2_000_000n);
    assert.match(marginOf(configured).reason, /inställda säkerhetsmarginal/);
    assert.notEqual(
      marginOf(derived).amountMinor,
      2_000_000n,
      "the fallback and the configured value differ, so this test means something",
    );
    assert.match(marginOf(derived).reason, /5 %/);
  });

  it("treats a configured minimum cash balance as a floor, never a ceiling", () => {
    const operatingOf = (r: ReturnType<typeof calculateLiquidityRequirement>) =>
      r.components.find((c) => c.key === "OPERATING_CASH")!.amountMinor;

    // A floor above a normal month raises operating cash.
    const high = calculateLiquidityRequirement(
      stableHousehold({ policy: { minimumCashBalanceMinor: 9_000_000n } }),
    );
    assert.equal(operatingOf(high), 9_000_000n);

    // A floor below a normal month must not lower it.
    const low = calculateLiquidityRequirement(
      stableHousehold({ policy: { minimumCashBalanceMinor: 100_000n } }),
    );
    const none = calculateLiquidityRequirement(stableHousehold());
    assert.equal(operatingOf(low), operatingOf(none));
  });

  it("reports the configured emergency target beside the derived one, overriding neither", () => {
    const result = calculateLiquidityRequirement(
      stableHousehold({ policy: { emergencyFundTargetMinor: 12_000_000n } }),
    );
    const derivedReserve = result.components.find(
      (c) => c.key === "EMERGENCY_RESERVE",
    )!.amountMinor;
    assert.ok(result.policyComparison, "the comparison is present when a target is set");
    assert.equal(result.policyComparison!.configuredEmergencyFundMinor, 12_000_000n);
    assert.equal(result.policyComparison!.derivedEmergencyReserveMinor, derivedReserve);
    assert.equal(
      result.policyComparison!.differenceMinor,
      derivedReserve - 12_000_000n,
      "the difference is stated so a household can see its target is low",
    );
    // The derived reserve is what the requirement uses; the target does not replace it.
    assert.notEqual(derivedReserve, 12_000_000n);
  });

  it("says nothing about policy when the household has expressed none", () => {
    const result = calculateLiquidityRequirement(stableHousehold());
    assert.equal(result.policyComparison, null);
  });
});

describe("liquidity properties that must always hold (§64)", () => {
  it("a larger upcoming obligation never lowers the requirement", () => {
    const base = calculateLiquidityRequirement(stableHousehold());
    const withObligation = calculateLiquidityRequirement(
      stableHousehold({
        upcomingObligations: [
          { label: "Försäkring", amountMinor: 1_200_000n, dueDate: "2026-02-01", confidence: 100 },
        ],
      }),
    );
    assert.ok(withObligation.requiredMinor > base.requiredMinor);

    const withBigger = calculateLiquidityRequirement(
      stableHousehold({
        upcomingObligations: [
          { label: "Försäkring", amountMinor: 5_000_000n, dueDate: "2026-02-01", confidence: 100 },
        ],
      }),
    );
    assert.ok(withBigger.requiredMinor > withObligation.requiredMinor);
  });

  it("higher essential costs never lower the requirement", () => {
    let previous = 0n;
    for (const essential of [2_000_000n, 3_000_000n, 4_000_000n, 6_000_000n]) {
      const result = calculateLiquidityRequirement(
        stableHousehold({ monthlyCosts: months(24, essential) }),
      );
      assert.ok(
        result.requiredMinor >= previous,
        `essentials ${essential} produced a smaller requirement than the level below`,
      );
      previous = result.requiredMinor;
    }
  });

  it("higher income volatility never lowers the risk adjustment", () => {
    const steady = calculateLiquidityRequirement(stableHousehold());
    const jumpy = calculateLiquidityRequirement(
      stableHousehold({
        monthlyIncome: income(24, 6_800_000n).map((month, index) => ({
          ...month,
          amountMinor: index % 2 === 0 ? 1_000_000n : 12_600_000n,
        })),
      }),
    );
    const riskOf = (r: ReturnType<typeof calculateLiquidityRequirement>) =>
      r.components.find((c) => c.key === "INCOME_RISK_BUFFER")!.amountMinor;
    assert.ok(riskOf(jumpy) >= riskOf(steady));
    const reserveOf = (r: ReturnType<typeof calculateLiquidityRequirement>) =>
      r.components.find((c) => c.key === "EMERGENCY_RESERVE")!.amountMinor;
    assert.ok(reserveOf(jumpy) >= reserveOf(steady), "the reserve lengthens too");
  });

  it("a funded sinking fund is not demanded twice", () => {
    const unfunded = calculateLiquidityRequirement(
      stableHousehold({
        sinkingFunds: [{ label: "Försäkring", targetMinor: 1_200_000n, fundedMinor: 0n }],
      }),
    );
    const halfFunded = calculateLiquidityRequirement(
      stableHousehold({
        sinkingFunds: [{ label: "Försäkring", targetMinor: 1_200_000n, fundedMinor: 600_000n }],
      }),
    );
    const fullyFunded = calculateLiquidityRequirement(
      stableHousehold({
        sinkingFunds: [{ label: "Försäkring", targetMinor: 1_200_000n, fundedMinor: 1_200_000n }],
      }),
    );
    const fundOf = (r: ReturnType<typeof calculateLiquidityRequirement>) =>
      r.components.find((c) => c.key === "SINKING_FUNDS")!.amountMinor;
    assert.equal(fundOf(unfunded), 1_200_000n);
    assert.equal(fundOf(halfFunded), 600_000n, "only what remains to save");
    assert.equal(fundOf(fullyFunded), 0n, "already set aside is not required again");
  });

  it("an over-funded sinking fund does not become a negative requirement", () => {
    const over = calculateLiquidityRequirement(
      stableHousehold({
        sinkingFunds: [{ label: "Försäkring", targetMinor: 1_000_000n, fundedMinor: 4_000_000n }],
      }),
    );
    const fund = over.components.find((c) => c.key === "SINKING_FUNDS")!;
    assert.equal(fund.amountMinor, 0n, "surplus in a fund must not offset other needs");
  });
});

describe("stress scenarios", () => {
  it("uses the household's own worst month, and says what it survives", () => {
    const scenarios = runStressScenarios({
      liquidCashMinor: 10_000_000n,
      monthlyCosts: months(12, 3_000_000n, {
        overrides: { 7: { essentialMinor: 9_000_000n } },
      }),
      monthlyIncome: income(12, 6_000_000n),
    });
    assert.equal(scenarios.length, 6);
    const oneMonth = scenarios.find((s) => s.key === "NO_INCOME_1M")!;
    assert.equal(oneMonth.remainingCashMinor, 7_000_000n);
    assert.equal(oneMonth.survives, true);

    const threeMonths = scenarios.find((s) => s.key === "NO_INCOME_3M")!;
    assert.equal(threeMonths.remainingCashMinor, 1_000_000n);

    // The worst historical month is the 9 000 000 outlier, not the median.
    const worst = scenarios.find((s) => s.key === "WORST_HISTORICAL_MONTH")!;
    assert.equal(worst.remainingCashMinor, 1_000_000n);
  });

  it("marks a household that cannot survive the scenario", () => {
    const scenarios = runStressScenarios({
      liquidCashMinor: 500_000n,
      monthlyCosts: months(12, 3_000_000n),
      monthlyIncome: income(12, 6_000_000n),
    });
    assert.equal(scenarios.find((s) => s.key === "NO_INCOME_1M")!.survives, false);
  });
});

describe("backtest without look-ahead (§65)", () => {
  it("judges each month only on the months before it", () => {
    // A household whose costs are flat for a year and then double. The doubled
    // months must register as breaches, because the earlier recommendation could
    // not have known about them.
    const costs = [
      ...months(12, 2_000_000n).map((m, i) => ({ ...m, month: `2024-${String(i + 1).padStart(2, "0")}` })),
      ...months(6, 12_000_000n).map((m, i) => ({ ...m, month: `2025-${String(i + 1).padStart(2, "0")}` })),
    ];
    const result = backtestLiquidityRecommendation({
      monthlyCosts: costs,
      monthlyIncome: income(18, 6_000_000n),
      warmupMonths: 6,
    });
    assert.equal(result.monthsTested, 12);
    assert.ok(result.breaches.length > 0, "the unforeseeable jump must show as a breach");
    assert.ok(
      result.breaches.every((breach) => breach.month.startsWith("2025")),
      "only the doubled months breach; the flat year was covered",
    );
  });

  it("a genuinely stable household survives its own history", () => {
    const result = backtestLiquidityRecommendation({
      monthlyCosts: months(24, 3_000_000n),
      monthlyIncome: income(24, 6_000_000n),
      warmupMonths: 6,
    });
    assert.equal(result.monthsTested, 18);
    assert.equal(result.breaches.length, 0);
    assert.equal(result.monthsSurvived, 18);
  });

  it("says nothing when there is not enough history to judge", () => {
    const result = backtestLiquidityRecommendation({
      monthlyCosts: months(4, 3_000_000n),
      monthlyIncome: income(4, 6_000_000n),
      warmupMonths: 6,
    });
    assert.equal(result.monthsTested, 0);
    assert.equal(result.breaches.length, 0);
  });
});

describe("savings waterfall against an independent oracle (§66)", () => {
  it("allocates in policy order, with the arithmetic written out in the test", () => {
    // Expected values computed here by hand, not by the helper under test.
    const income = 6_800_000n; // 68 000,00 kr
    const costs = 3_970_000n; // 39 700,00 kr
    const surplus = 2_830_000n; // 28 300,00 kr — stated in §40

    const target = calculateSavingsTarget({
      medianIncomeMinor: income,
      medianTotalCostMinor: costs,
      reserveShortfallMinor: 7_200_000n, // spread over 12 months = 600 000
      operatingCashShortfallMinor: 0n,
      nearTermObligationsMinor: 0n,
      sinkingFundMonthlyMinor: 300_000n,
      priorityGoalMonthlyMinor: 700_000n,
      debtStrategyMonthlyMinor: 0n,
      reserveHorizonMonths: 12,
    });

    assert.equal(target.normalMonthlySurplusMinor, surplus);
    assert.equal(target.cashflowNegative, false);

    const byKey = new Map(target.allocations.map((a) => [a.key, a.amountMinor]));
    assert.equal(byKey.get("EMERGENCY_RESERVE_DEFICIT"), 600_000n, "7 200 000 / 12");
    assert.equal(byKey.get("SINKING_FUNDS"), 300_000n);
    assert.equal(byKey.get("PRIORITY_GOALS"), 700_000n);

    // 2 830 000 − 600 000 − 300 000 − 700 000 = 1 230 000 left.
    // 70% of that to investment = 861 000, and the remaining 369 000 is free.
    assert.equal(byKey.get("INVESTMENT_CONTRIBUTION"), 861_000n);
    assert.equal(byKey.get("DISCRETIONARY_SURPLUS"), 369_000n);

    // Nothing is allocated twice, and nothing exceeds the surplus.
    assert.equal(target.totalAllocatedMinor, surplus);
  });

  it("stops at the level the surplus reaches, rather than part-funding everything", () => {
    const target = calculateSavingsTarget({
      medianIncomeMinor: 3_000_000n,
      medianTotalCostMinor: 2_900_000n, // only 100 000 surplus
      reserveShortfallMinor: 12_000_000n, // wants 1 000 000/month
      operatingCashShortfallMinor: 0n,
      nearTermObligationsMinor: 0n,
      sinkingFundMonthlyMinor: 500_000n,
      priorityGoalMonthlyMinor: 500_000n,
      debtStrategyMonthlyMinor: 0n,
      reserveHorizonMonths: 12,
    });
    const byKey = new Map(target.allocations.map((a) => [a.key, a.amountMinor]));
    assert.equal(byKey.get("EMERGENCY_RESERVE_DEFICIT"), 100_000n, "takes what is left, no more");
    assert.equal(byKey.has("SINKING_FUNDS"), false, "later levels get nothing");
    assert.equal(byKey.has("INVESTMENT_CONTRIBUTION"), false);
    assert.equal(target.totalAllocatedMinor, 100_000n);
  });

  it("recommends no saving at all when a normal month does not balance", () => {
    const target = calculateSavingsTarget({
      medianIncomeMinor: 3_000_000n,
      medianTotalCostMinor: 3_400_000n,
      reserveShortfallMinor: 5_000_000n,
      operatingCashShortfallMinor: 0n,
      nearTermObligationsMinor: 0n,
      sinkingFundMonthlyMinor: 0n,
      priorityGoalMonthlyMinor: 0n,
      debtStrategyMonthlyMinor: 0n,
    });
    assert.equal(target.cashflowNegative, true);
    assert.equal(target.allocations.length, 0);
    assert.equal(target.normalMonthlySurplusMinor, -400_000n);
    assert.match(target.notes.join(" "), /rekommenderar inget sparande/);
  });

  it("obligations are funded before anything discretionary", () => {
    const target = calculateSavingsTarget({
      medianIncomeMinor: 5_000_000n,
      medianTotalCostMinor: 4_000_000n, // 1 000 000 surplus
      reserveShortfallMinor: 0n,
      operatingCashShortfallMinor: 200_000n,
      nearTermObligationsMinor: 500_000n,
      sinkingFundMonthlyMinor: 0n,
      priorityGoalMonthlyMinor: 0n,
      debtStrategyMonthlyMinor: 0n,
    });
    assert.deepEqual(
      target.allocations.map((a) => a.key),
      [
        "NEAR_TERM_OBLIGATIONS",
        "OPERATING_CASH",
        "INVESTMENT_CONTRIBUTION",
        "DISCRETIONARY_SURPLUS",
      ],
    );
  });
});

describe("cash runway", () => {
  it("reports three assumptions, and essential-only lasts longest", () => {
    const runway = calculateCashRunway({
      liquidCashMinor: 20_000_000n,
      medianTotalCostMinor: 4_000_000n,
      medianEssentialCostMinor: 2_500_000n,
      medianIncomeMinor: 5_000_000n,
    });
    assert.equal(runway.normalMonths, 5);
    assert.equal(runway.essentialOnlyMonths, 8);
    // 30% less income leaves 3 500 000; costs 4 000 000; burn 500 000/month.
    assert.equal(runway.incomeReducedMonths, 40);
  });

  it("returns null rather than infinity when there is nothing to burn", () => {
    const runway = calculateCashRunway({
      liquidCashMinor: 1_000_000n,
      medianTotalCostMinor: 0n,
      medianEssentialCostMinor: 0n,
      medianIncomeMinor: 5_000_000n,
    });
    assert.equal(runway.normalMonths, null);
    assert.equal(runway.essentialOnlyMonths, null);
    assert.equal(runway.incomeReducedMonths, null, "income exceeds costs: no runway needed");
  });
});

describe("financial resilience", () => {
  it("reports dimensions separately, with no single score", () => {
    const requirement = calculateLiquidityRequirement(stableHousehold());
    const resilience = assessFinancialResilience({
      requirement,
      runway: calculateCashRunway({
        liquidCashMinor: 28_400_000n,
        medianTotalCostMinor: 5_140_000n,
        medianEssentialCostMinor: 3_840_000n,
        medianIncomeMinor: 6_800_000n,
      }),
      fixedCostShareBps: 4200,
      debtServiceShareBps: 1500,
    });
    assert.equal(resilience.dimensions.length, 7);
    assert.ok(
      !("score" in (resilience as unknown as Record<string, unknown>)),
      "no composite score may hide a weak dimension",
    );
    for (const dimension of resilience.dimensions) {
      assert.ok(dimension.detail.length > 5, `${dimension.key} must explain itself`);
    }
  });

  it("says UNKNOWN rather than guessing when a dimension has no data", () => {
    const requirement = calculateLiquidityRequirement({
      monthlyCosts: [],
      monthlyIncome: [],
      upcomingObligations: [],
      sinkingFunds: [],
      liquidCashMinor: 0n,
      coveragePercent: 0,
      dataAgeDays: 0,
    });
    const resilience = assessFinancialResilience({
      requirement,
      runway: { normalMonths: null, essentialOnlyMonths: null, incomeReducedMonths: null },
      fixedCostShareBps: null,
      debtServiceShareBps: null,
    });
    const unknown = resilience.dimensions.filter((d) => d.level === "UNKNOWN");
    assert.ok(unknown.length >= 3, "missing data is reported as unknown, not as strong");
  });
});
