import {
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, ne } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import {
  annualizeSubscription,
  assessCoverageRisk,
  assessDebtRisk,
  assessFixedCostRisk,
  assessLiquidityRisk,
  assessVehicleFinancingRisk,
  backtestLinearForecast,
  buildForecastPoints,
  calculateLifestyleCreep,
  parseScenarioAssumptions,
  savingsOptimizerSuggestions,
  simulateScenario,
  vehicleNetEquity,
  type OptimizerSuggestion,
} from "@ffos/financial-engine";
import type {
  CreateScenarioInput,
  SimulateScenarioInput,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { accounts } from "../db/schema-economic";
import {
  forecastAccuracyMetrics,
  forecastActualComparisons,
  forecastPoints,
  forecastRuns,
  opportunities,
  scenarios,
} from "../db/schema-decisions";
import { subscriptions } from "../db/schema-planning";
import { vehicleFinanceAgreements, vehicles } from "../db/schema-vehicles";
import { DebtService } from "../debt/debt.service";
import { HouseholdAccessService } from "../households/household-access.service";
import {
  HouseholdMetricsService,
  lastNMonths,
} from "../metrics/household-metrics.service";
import { PlanningMetricsService } from "../planning/planning-metrics.service";
import { VehiclesService } from "../vehicles/vehicles.service";
import {
  OpportunitiesGeneratorService,
  resolveHouseholdCurrency,
} from "./opportunities-generator.service";

const DEMO_AS_OF = () => process.env.DEMO_AS_OF_DATE ?? "2026-08-01";

@Injectable()
export class DecisionsService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(HouseholdMetricsService)
    private readonly metrics: HouseholdMetricsService,
    @Inject(PlanningMetricsService)
    private readonly planning: PlanningMetricsService,
    @Inject(DebtService) private readonly debt: DebtService,
    @Inject(VehiclesService) private readonly vehicles: VehiclesService,
    @Inject(OpportunitiesGeneratorService)
    private readonly generator: OpportunitiesGeneratorService = new OpportunitiesGeneratorService(),
  ) {}

  private async baselineSeed(householdId: string, currency: CurrencyCode, asOf: string) {
    const snap = await this.metrics.getFinancialSnapshot(
      householdId,
      currency,
      asOf,
    );
    return {
      snap,
      seed: {
        startingCashMinor: snap.position.availableCash.amountMinor,
        startingNetWorthMinor: snap.position.netWorth.amountMinor,
        monthlyNetSavingsMinor: snap.savingsMinor,
        asOf,
      },
    };
  }

  /** Optimizer suggestions are the deterministic opportunities with positive annual impact. */
  private async optimizer(
    householdId: string,
    currency: CurrencyCode,
    asOf: string,
  ): Promise<OptimizerSuggestion[]> {
    const detected = await this.generator.detectAll(householdId, currency, asOf);
    const items: OptimizerSuggestion[] = detected
      .filter(
        (o) =>
          o.estimatedAnnualImpactMinor != null && o.estimatedAnnualImpactMinor > 0n,
      )
      .slice(0, 5)
      .map((o) => ({
        id: o.identityKey,
        title: o.title,
        estimatedAnnualSavingMinor: o.estimatedAnnualImpactMinor!,
        effort: o.effort,
        estimateBasis: o.estimateBasis,
      }));
    return savingsOptimizerSuggestions({ items });
  }

  private async computeForecast(
    householdId: string,
    currency: CurrencyCode,
    asOf: string,
  ) {
    const { snap, seed } = await this.baselineSeed(householdId, currency, asOf);
    const points = buildForecastPoints(seed);
    const optimizer = await this.optimizer(householdId, currency, asOf);

    // Persist a live run for backtesting / audit (non-destructive of ledger).
    const db = getDb();
    const [run] = await db
      .insert(forecastRuns)
      .values({
        householdId,
        asOf,
        horizonDays: 365,
        currency,
      })
      .returning();
    if (run) {
      await db.insert(forecastPoints).values(
        points.map((p) => ({
          householdId,
          forecastRunId: run.id,
          onDate: p.onDate,
          projectedCashMinor: p.projectedCashMinor,
          projectedNetWorthMinor: p.projectedNetWorthMinor,
          label: p.label,
        })),
      );
    }

    return {
      asOf,
      source: "live-engine" as const,
      baseline: {
        availableCash: moneyToJson(snap.position.availableCash),
        netWorth: moneyToJson(snap.position.netWorth),
        monthlyNetSavings: moneyToJson(money(snap.savingsMinor, currency)),
      },
      points: points.map((p) => ({
        onDate: p.onDate,
        label: p.label,
        projectedCash: moneyToJson(money(p.projectedCashMinor, currency)),
        projectedNetWorth: moneyToJson(money(p.projectedNetWorthMinor, currency)),
      })),
      optimizer: optimizer.map((o) => ({
        id: o.id,
        title: o.title,
        estimatedAnnualSaving: moneyToJson(
          money(o.estimatedAnnualSavingMinor, currency),
        ),
        effort: o.effort,
        estimateBasis: o.estimateBasis ?? null,
      })),
    };
  }

  async forecast(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = DEMO_AS_OF();
    return this.computeForecast(householdId, currency, asOf);
  }

  /** Job-path entry — no userId / request access check (caller already validated the job). */
  async generateForecast(householdId: string) {
    const currency = await resolveHouseholdCurrency(householdId);
    const asOf = DEMO_AS_OF();
    return this.computeForecast(householdId, currency, asOf);
  }

  async backtest(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = DEMO_AS_OF();
    const lookbackDays = 30;
    const { seed } = await this.baselineSeed(householdId, currency, asOf);
    const result = backtestLinearForecast({
      asOf,
      actualCashMinor: seed.startingCashMinor,
      actualNetWorthMinor: seed.startingNetWorthMinor,
      monthlyNetSavingsMinor: seed.monthlyNetSavingsMinor,
      lookbackDays,
    });

    const db = getDb();
    const [run] = await db
      .select()
      .from(forecastRuns)
      .where(eq(forecastRuns.householdId, householdId))
      .orderBy(desc(forecastRuns.createdAt))
      .limit(1);

    if (result.comparisons.length) {
      await db.insert(forecastActualComparisons).values(
        result.comparisons.map((c) => ({
          householdId,
          forecastRunId: run?.id ?? null,
          label: c.label,
          onDate: c.onDate,
          projectedCashMinor: c.projectedCashMinor,
          actualCashMinor: c.actualCashMinor,
          projectedNetWorthMinor: c.projectedNetWorthMinor,
          actualNetWorthMinor: c.actualNetWorthMinor,
          cashErrorMinor: c.cashErrorMinor,
          netWorthErrorMinor: c.netWorthErrorMinor,
        })),
      );
      await db.insert(forecastAccuracyMetrics).values(
        result.metrics.map((m) => ({
          householdId,
          forecastRunId: run?.id ?? null,
          horizonLabel: m.horizonLabel,
          sampleCount: m.sampleCount,
          mapeCashPercent:
            m.mapeCashPercent == null ? null : m.mapeCashPercent.toFixed(4),
          mapeNetWorthPercent:
            m.mapeNetWorthPercent == null
              ? null
              : m.mapeNetWorthPercent.toFixed(4),
          absCashErrorMinor: m.absCashErrorMinor,
          absNetWorthErrorMinor: m.absNetWorthErrorMinor,
        })),
      );
    }

    return {
      asOf,
      pastAsOf: result.pastAsOf,
      lookbackDays,
      comparisons: result.comparisons.map((c) => ({
        label: c.label,
        onDate: c.onDate,
        projectedCash: moneyToJson(money(c.projectedCashMinor, currency)),
        actualCash: moneyToJson(money(c.actualCashMinor, currency)),
        projectedNetWorth: moneyToJson(money(c.projectedNetWorthMinor, currency)),
        actualNetWorth: moneyToJson(money(c.actualNetWorthMinor, currency)),
        cashError: moneyToJson(money(c.cashErrorMinor, currency)),
        netWorthError: moneyToJson(money(c.netWorthErrorMinor, currency)),
      })),
      metrics: result.metrics.map((m) => ({
        horizonLabel: m.horizonLabel,
        sampleCount: m.sampleCount,
        mapeCashPercent: m.mapeCashPercent,
        mapeNetWorthPercent: m.mapeNetWorthPercent,
        absCashError: moneyToJson(money(m.absCashErrorMinor, currency)),
        absNetWorthError: moneyToJson(money(m.absNetWorthErrorMinor, currency)),
      })),
    };
  }

  /**
   * Detect + persist opportunities, then serve from the persisted rows (source
   * of truth for lifecycle status: NEW/ACTIVE/VIEWED/ACCEPTED/DISMISSED/EXPIRED).
   */
  async opportunities(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = DEMO_AS_OF();
    return this.computeOpportunities(householdId, currency, asOf);
  }

  /** Job-path entry — no userId / request access check. */
  async generateOpportunities(householdId: string) {
    const currency = await resolveHouseholdCurrency(householdId);
    const asOf = DEMO_AS_OF();
    return this.computeOpportunities(householdId, currency, asOf);
  }

  private async computeOpportunities(
    householdId: string,
    currency: CurrencyCode,
    asOf: string,
  ) {
    await this.generator.generate(householdId, currency, asOf);

    const db = getDb();
    const rows = await db
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.householdId, householdId),
          ne(opportunities.status, "DISMISSED"),
          ne(opportunities.status, "EXPIRED"),
        ),
      )
      .orderBy(desc(opportunities.priorityScore));

    return {
      asOf,
      source: "live-engine" as const,
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        detectorKey: row.detectorKey,
        title: row.title,
        description: row.description,
        estimatedAnnualSaving: row.estimatedAnnualSavingMinor
          ? moneyToJson(money(row.estimatedAnnualSavingMinor, currency))
          : null,
        estimatedMonthlyImpact: row.estimatedMonthlyImpactMinor
          ? moneyToJson(money(row.estimatedMonthlyImpactMinor, currency))
          : null,
        estimateBasis: row.estimateBasis,
        assumptions: row.assumptions ?? [],
        facts: row.facts ?? [],
        dataSources: row.dataSources ?? [],
        confidence: row.confidenceScore != null ? Number(row.confidenceScore) : null,
        confidenceLabel: (row.confidenceLabel ?? undefined) as
          | "low"
          | "medium"
          | "high"
          | undefined,
        priorityScore: row.priorityScore != null ? Number(row.priorityScore) : undefined,
        effort: row.effort,
        risk: row.risk,
        priority: row.priority,
        status: row.status,
        category: row.category,
        evidence: row.evidence ?? [],
        calculationVersion: row.calculationVersion,
        inputHash: row.inputHash,
        lastCalculatedAt: row.lastCalculatedAt
          ? row.lastCalculatedAt.toISOString()
          : null,
        analysisStatus: "live" as const,
      })),
      lifestyleCreep: await this.lifestyleCreepSummary(householdId, currency, asOf),
    };
  }

  private async lifestyleCreepSummary(
    householdId: string,
    currency: CurrencyCode,
    asOf: string,
  ) {
    const months = lastNMonths(asOf, 15);
    const monthlyPoints = await this.metrics.monthlyTotals(householdId, months);
    const recentMonths = months.slice(-3);
    const baselineMonths = months.slice(0, Math.max(0, months.length - 3)).slice(-12);
    const categorySpends = await this.metrics.categorySpendComparison(
      householdId,
      recentMonths,
      baselineMonths,
    );
    const creep = calculateLifestyleCreep({
      asOf,
      monthlyPoints: monthlyPoints.map((p) => ({
        month: p.month,
        spendingMinor: p.spendingMinor,
      })),
      categorySpends,
    });
    return {
      creeping: creep.creeping,
      recentAvgMonthly: moneyToJson(money(creep.recentAvgMonthlyMinor, currency)),
      baselineAvgMonthly: moneyToJson(money(creep.baselineAvgMonthlyMinor, currency)),
      delta: moneyToJson(money(creep.deltaMinor, currency)),
      deltaPercent: creep.deltaPercent,
      drivers: creep.drivers.map((d) => ({
        categoryKey: d.categoryKey,
        categoryName: d.categoryName,
        delta: moneyToJson(money(d.deltaMinor, currency)),
        deltaPercent: d.deltaPercent,
        href: `/transactions?q=${encodeURIComponent(d.categoryName)}`,
      })),
    };
  }

  /** Vehicle financing risk signal without a userId — direct DB + engine math. */
  private async vehicleFinancingSignal(householdId: string) {
    const db = getDb();
    const [vehicle] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.householdId, householdId))
      .limit(1);
    if (!vehicle) return null;
    const [finance] = await db
      .select()
      .from(vehicleFinanceAgreements)
      .where(eq(vehicleFinanceAgreements.vehicleId, vehicle.id))
      .limit(1);
    const equity = vehicleNetEquity({
      estimatedValueMidMinor: vehicle.estimatedValueMidMinor ?? 0n,
      remainingDebtMinor: finance?.remainingMinor ?? 0n,
      sellingCostMinor: 5_000_00n,
    });
    return assessVehicleFinancingRisk({
      negativeEquity: equity.negativeEquity,
      netEquityMinor: equity.netEquityMinor,
      vehicleId: vehicle.id,
    });
  }

  private async computeRisk(householdId: string, currency: CurrencyCode, asOf: string) {
    const snap = await this.metrics.getFinancialSnapshot(householdId, currency, asOf);
    const coverage = await this.metrics.coverage(householdId, asOf);
    const db = getDb();
    const subs = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.householdId, householdId),
          eq(subscriptions.status, "ACTIVE"),
        ),
      );
    const subscriptionAnnualMinor = subs.reduce(
      (sum, s) =>
        sum +
        annualizeSubscription(
          s.amountMinor,
          s.cadence as "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY",
        ),
      0n,
    );
    const [mortgage] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          eq(accounts.accountType, "MORTGAGE"),
        ),
      )
      .limit(1);

    const liq = assessLiquidityRisk({
      availableCashMinor: snap.position.availableCash.amountMinor,
      monthlySpendingMinor: snap.spendingMinor,
    });
    const debt = assessDebtRisk({
      liabilitiesMinor: snap.position.liabilities.amountMinor,
      monthlyIncomeMinor: snap.incomeMinor,
      mortgageAccountId: mortgage?.id ?? null,
    });
    const fixed = assessFixedCostRisk({
      fixedAnnualMinor: subscriptionAnnualMinor,
      monthlyIncomeMinor: snap.incomeMinor,
    });
    const cov = assessCoverageRisk({ coveragePercent: coverage.percent });
    const vehicleSignal = await this.vehicleFinancingSignal(householdId);

    const signals = [
      liq.signal,
      debt.signal,
      fixed.signal,
      cov.signal,
      ...(vehicleSignal ? [vehicleSignal] : []),
    ];
    const health = [liq.health, debt.health, fixed.health, cov.health];

    return {
      asOf,
      source: "live-engine" as const,
      signals: signals.map((s) => ({
        id: s.id,
        dimension: s.dimension,
        level: s.level,
        title: s.title,
        detail: s.detail,
        score: s.score,
        evidence: s.evidence,
      })),
      health,
    };
  }

  async risk(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = DEMO_AS_OF();
    return this.computeRisk(householdId, currency, asOf);
  }

  /** Job-path entry — no userId / request access check. */
  async runRiskAnalysis(householdId: string) {
    const currency = await resolveHouseholdCurrency(householdId);
    const asOf = DEMO_AS_OF();
    return this.computeRisk(householdId, currency, asOf);
  }

  async scenarios(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = DEMO_AS_OF();
    const db = getDb();
    const rows = await db
      .select()
      .from(scenarios)
      .where(eq(scenarios.householdId, householdId));
    return {
      asOf,
      items: rows.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        status: s.status,
        projectedMonthlyDelta: moneyToJson(
          money(s.projectedMonthlyDeltaMinor, currency),
        ),
        assumptions: s.assumptions ?? {},
      })),
    };
  }

  async createScenario(userId: string, input: CreateScenarioInput) {
    const { household } = await this.access.requireCanWrite(
      userId,
      input.householdId,
    );
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = DEMO_AS_OF();
    const assumptions = input.assumptions ?? {};
    const { seed } = await this.baselineSeed(input.householdId, currency, asOf);
    const mortgage = await this.debt.primaryMortgageContext(input.householdId);
    const sim = simulateScenario({
      baseline: seed,
      assumptions: parseScenarioAssumptions(assumptions as Record<string, unknown>),
      mortgage,
    });

    const db = getDb();
    await db.insert(scenarios).values({
      householdId: input.householdId,
      name: input.name,
      description: input.description ?? "",
      status: "READY",
      assumptions: assumptions as Record<string, unknown>,
      projectedMonthlyDeltaMinor: sim.projectedMonthlyDeltaMinor,
      currency,
    });

    return this.scenarios(userId, input.householdId);
  }

  async simulateScenario(
    userId: string,
    scenarioId: string,
    input: SimulateScenarioInput,
  ) {
    const { household } = await this.access.requireCanWrite(
      userId,
      input.householdId,
    );
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = DEMO_AS_OF();
    const db = getDb();
    const [row] = await db
      .select()
      .from(scenarios)
      .where(
        and(
          eq(scenarios.id, scenarioId),
          eq(scenarios.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException("Scenario not found");

    const assumptionsRaw = (input.assumptions ??
      row.assumptions ??
      {}) as Record<string, unknown>;
    const { seed } = await this.baselineSeed(input.householdId, currency, asOf);
    const mortgage = await this.debt.primaryMortgageContext(input.householdId);
    const sim = simulateScenario({
      baseline: seed,
      assumptions: parseScenarioAssumptions(assumptionsRaw),
      mortgage,
    });

    // Update cached delta on the scenario definition only — never ledger.
    await db
      .update(scenarios)
      .set({ projectedMonthlyDeltaMinor: sim.projectedMonthlyDeltaMinor })
      .where(eq(scenarios.id, scenarioId));

    return {
      asOf,
      scenarioId: row.id,
      name: row.name,
      ledgerMutated: false as const,
      projectedMonthlyDelta: moneyToJson(
        money(sim.projectedMonthlyDeltaMinor, currency),
      ),
      baselineMonthlySavings: moneyToJson(
        money(sim.baselineMonthlySavingsMinor, currency),
      ),
      adjustedMonthlySavings: moneyToJson(
        money(sim.adjustedMonthlySavingsMinor, currency),
      ),
      assumptions: assumptionsRaw,
      points: sim.points.map((p) => ({
        onDate: p.onDate,
        label: p.label,
        projectedCash: moneyToJson(money(p.projectedCashMinor, currency)),
        projectedNetWorth: moneyToJson(money(p.projectedNetWorthMinor, currency)),
      })),
    };
  }

  private async computeInsights(
    householdId: string,
    currency: CurrencyCode,
    asOf: string,
  ) {
    const [forecastRes, riskRes, detected] = await Promise.all([
      this.computeForecast(householdId, currency, asOf),
      this.computeRisk(householdId, currency, asOf),
      this.generator.generate(householdId, currency, asOf),
    ]);
    return {
      asOf,
      headline: "Deterministiska insikter från forecast, risk och opportunities",
      items: [
        ...detected.slice(0, 2).map((o) => ({
          id: `opp-${o.identityKey}`,
          title: o.title,
          detail: o.description,
          kind: "opportunity",
        })),
        ...riskRes.signals.slice(0, 2).map((s) => ({
          id: `risk-${s.id}`,
          title: s.title,
          detail: s.detail,
          kind: "risk",
        })),
        ...forecastRes.optimizer.slice(0, 1).map((o) => ({
          id: `opt-${o.id}`,
          title: o.title,
          detail: `Uppskattad årsbesparing via savings optimizer.`,
          kind: "optimizer",
        })),
      ],
    };
  }

  async insights(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = DEMO_AS_OF();
    return this.computeInsights(householdId, currency, asOf);
  }

  /** Job-path entry — no userId / request access check. */
  async generateInsights(householdId: string) {
    const currency = await resolveHouseholdCurrency(householdId);
    const asOf = DEMO_AS_OF();
    return this.computeInsights(householdId, currency, asOf);
  }
}
