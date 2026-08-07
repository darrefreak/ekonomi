import {
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import {
  annualizeSubscription,
  backtestLinearForecast,
  buildForecastPoints,
  parseScenarioAssumptions,
  savingsOptimizerSuggestions,
  simulateScenario,
} from "@ffos/financial-engine";
import type {
  CreateScenarioInput,
  SimulateScenarioInput,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import {
  forecastAccuracyMetrics,
  forecastActualComparisons,
  forecastPoints,
  forecastRuns,
  healthDimensions,
  opportunities,
  riskSignals,
  scenarios,
} from "../db/schema-decisions";
import { subscriptions } from "../db/schema-planning";
import { DebtService } from "../debt/debt.service";
import { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { PlanningMetricsService } from "../planning/planning-metrics.service";

@Injectable()
export class DecisionsService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(HouseholdMetricsService)
    private readonly metrics: HouseholdMetricsService,
    @Inject(PlanningMetricsService)
    private readonly planning: PlanningMetricsService,
    @Inject(DebtService) private readonly debt: DebtService,
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

  private async optimizer(householdId: string, currency: CurrencyCode, asOf: string) {
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
    const mortgageInterestAnnualMinor = await this.metrics.mortgageInterestAnnual(
      householdId,
      asOf,
    );
    const budget = await this.planning.getBudget(householdId, currency, asOf);
    const remainingMinor = budget
      ? BigInt(budget.totals.remaining.amountMinor)
      : 0n;
    const lifestyleOverBudgetMinor =
      remainingMinor < 0n ? -remainingMinor : 0n;

    return savingsOptimizerSuggestions({
      subscriptionAnnualMinor,
      mortgageInterestAnnualMinor,
      lifestyleOverBudgetMinor,
    });
  }

  async forecast(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
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
      })),
    };
  }

  async backtest(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
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

  async opportunities(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const db = getDb();
    const rows = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.householdId, householdId));
    return {
      asOf,
      items: rows.map((o) => ({
        id: o.id,
        title: o.title,
        description: o.description,
        estimatedAnnualSaving: o.estimatedAnnualSavingMinor
          ? moneyToJson(money(o.estimatedAnnualSavingMinor, currency))
          : null,
        confidence: o.confidence ? Number(o.confidence) : null,
        effort: o.effort,
        risk: o.risk,
        priority: o.priority,
        status: o.status,
        category: o.category,
      })),
    };
  }

  async risk(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const db = getDb();
    const signals = await db
      .select()
      .from(riskSignals)
      .where(eq(riskSignals.householdId, householdId));
    const health = await db
      .select()
      .from(healthDimensions)
      .where(eq(healthDimensions.householdId, householdId));
    return {
      asOf,
      signals: signals.map((s) => ({
        id: s.id,
        dimension: s.dimension,
        level: s.level,
        title: s.title,
        detail: s.detail,
        score: s.score,
      })),
      health: health.map((h) => ({
        dimension: h.dimension,
        score: h.score,
        level: h.level,
        summary: h.summary,
      })),
    };
  }

  async scenarios(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
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
    const { household } = await this.access.requireMembership(
      userId,
      input.householdId,
    );
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
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
    const { household } = await this.access.requireMembership(
      userId,
      input.householdId,
    );
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
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

  async insights(userId: string, householdId: string) {
    const [forecast, opps, risk] = await Promise.all([
      this.forecast(userId, householdId),
      this.opportunities(userId, householdId),
      this.risk(userId, householdId),
    ]);
    return {
      asOf: forecast.asOf,
      headline: "Deterministiska insikter från forecast, risk och opportunities",
      items: [
        ...opps.items.slice(0, 2).map((o) => ({
          id: `opp-${o.id}`,
          title: o.title,
          detail: o.description,
          kind: "opportunity",
        })),
        ...risk.signals.slice(0, 2).map((s) => ({
          id: `risk-${s.id}`,
          title: s.title,
          detail: s.detail,
          kind: "risk",
        })),
        ...forecast.optimizer.slice(0, 1).map((o) => ({
          id: `opt-${o.id}`,
          title: o.title,
          detail: `Uppskattad årsbesparing via savings optimizer.`,
          kind: "optimizer",
        })),
      ],
    };
  }
}
