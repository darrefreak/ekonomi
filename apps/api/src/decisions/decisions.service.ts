import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import {
  annualizeSubscription,
  savingsOptimizerSuggestions,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import {
  forecastPoints,
  forecastRuns,
  healthDimensions,
  opportunities,
  riskSignals,
  scenarios,
} from "../db/schema-decisions";
import { subscriptions } from "../db/schema-planning";
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
  ) {}

  async forecast(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const db = getDb();
    const [run] = await db
      .select()
      .from(forecastRuns)
      .where(eq(forecastRuns.householdId, householdId))
      .orderBy(desc(forecastRuns.createdAt))
      .limit(1);
    const points = run
      ? await db
          .select()
          .from(forecastPoints)
          .where(eq(forecastPoints.forecastRunId, run.id))
      : [];

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

    const optimizer = savingsOptimizerSuggestions({
      subscriptionAnnualMinor,
      mortgageInterestAnnualMinor,
      lifestyleOverBudgetMinor,
    });
    return {
      asOf,
      points: points.map((p) => ({
        onDate: p.onDate,
        label: p.label ?? "",
        projectedCash: moneyToJson(money(p.projectedCashMinor, currency)),
        projectedNetWorth: moneyToJson(money(p.projectedNetWorthMinor, currency)),
      })),
      optimizer: optimizer.map((o) => ({
        id: o.id,
        title: o.title,
        estimatedAnnualSaving: moneyToJson(money(o.estimatedAnnualSavingMinor, currency)),
        effort: o.effort,
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
