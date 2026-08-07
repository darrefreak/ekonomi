import { Inject, Injectable } from "@nestjs/common";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import type { DashboardResponse } from "@ffos/schemas";
import { DecisionsService } from "../decisions/decisions.service";
import { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { PlanningMetricsService } from "../planning/planning-metrics.service";
import { ReviewService } from "../review/review.service";

@Injectable()
export class DashboardService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(HouseholdMetricsService)
    private readonly metrics: HouseholdMetricsService,
    @Inject(ReviewService) private readonly review: ReviewService,
    @Inject(PlanningMetricsService)
    private readonly planning: PlanningMetricsService,
    @Inject(DecisionsService) private readonly decisions: DecisionsService,
  ) {}

  async getDashboard(userId: string, householdId: string): Promise<DashboardResponse> {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";

    const [snap, coverage, review, budget, opps] = await Promise.all([
      this.metrics.getFinancialSnapshot(householdId, currency, asOf),
      this.metrics.coverage(householdId, asOf),
      this.review.list(userId, householdId),
      this.planning.getBudget(householdId, currency, asOf),
      this.decisions.opportunities(userId, householdId),
    ]);

    const hour = new Date().getHours();
    const greeting =
      hour < 12 ? "God morgon" : hour < 18 ? "God eftermiddag" : "God kväll";

    const accountRows = await this.metrics.getAccountRows(householdId);
    const hasAccounts = accountRows.length > 0;
    const recentPoints = snap.cashflow.points.slice(-6);

    const opportunities = [...opps.items]
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 5)
      .map((o) => ({
        id: o.id,
        title: o.title,
        description: o.description,
        estimatedAnnualSaving: o.estimatedAnnualSaving,
        confidence: o.confidence,
        effort: o.effort,
        risk: o.risk,
        priority: o.priority,
        status: o.status,
        category: o.category,
      }));

    const brief = buildBrief({
      spendingDeltaPercent: snap.cashflow.comparison.spendingDeltaPercent,
      currentLabel: snap.cashflow.currentPeriod.label,
      previousLabel: snap.cashflow.previousPeriod.label,
      reviewTotal: review.total,
      opportunities,
      hasAccounts,
    });

    return {
      greeting,
      asOf,
      householdName: household.name,
      metricMeta: snap.metricMeta,
      position: {
        netWorth: moneyToJson(snap.position.netWorth),
        netWorthChangeMonth: moneyToJson(money(snap.changeMonthMinor, currency)),
        availableCash: moneyToJson(snap.position.availableCash),
        investments: moneyToJson(snap.position.investments),
        debt: moneyToJson(snap.position.liabilities),
      },
      thisMonth: {
        income: moneyToJson(money(snap.incomeMinor, currency)),
        spending: moneyToJson(money(snap.spendingMinor, currency)),
        savings: moneyToJson(money(snap.savingsMinor, currency)),
        savingsRatePercent: snap.savingsRate,
        budgetRemaining: budget
          ? budget.totals.remaining
          : moneyToJson(money(0n, currency)),
      },
      cashRunwayMonths: snap.runway,
      forecast: {
        days30: moneyToJson(money(snap.forecastDeltas.days30, currency)),
        days60: moneyToJson(money(snap.forecastDeltas.days60, currency)),
        days90: moneyToJson(money(snap.forecastDeltas.days90, currency)),
      },
      brief,
      upcoming: snap.upcoming,
      opportunities,
      coveragePercent: coverage.percent,
      freshnessLabel: hasAccounts
        ? coverage.freshnessSummary ??
          coverage.freshness[0]?.freshnessLabel ??
          "Ingen synkad källa"
        : "Ingen data",
      cashflowPoints: recentPoints,
      coverageAreas: coverage.areas,
      coverageFreshness: coverage.freshness,
      reviewCount: review.total,
      hasAccounts,
    };
  }
}

export function buildBrief(input: {
  spendingDeltaPercent: number;
  currentLabel: string;
  previousLabel: string;
  reviewTotal: number;
  opportunities: Array<{ id: string; title: string; description: string }>;
  hasAccounts: boolean;
}): DashboardResponse["brief"] {
  if (!input.hasAccounts) {
    return {
      headline: "Kom igång med din ekonomi",
      items: [
        {
          id: "empty-accounts",
          title: "Inga konton ännu",
          detail:
            "Lägg till konton eller ladda demodata för att se nettoförmögenhet, kassaflöde och opportunities.",
        },
      ],
    };
  }

  const items: DashboardResponse["brief"]["items"] = [
    {
      id: "cashflow-delta",
      title: "Utgifter jämfört med förra perioden",
      detail: `Utgifterna i ${input.currentLabel} är ${input.spendingDeltaPercent}% jämfört med ${input.previousLabel}.`,
    },
  ];

  for (const opp of input.opportunities.slice(0, 2)) {
    items.push({
      id: `opp-${opp.id}`,
      title: opp.title,
      detail: opp.description,
    });
  }

  if (input.reviewTotal > 0) {
    items.push({
      id: "review",
      title: `${input.reviewTotal} poster behöver granskning`,
      detail: "Okända merchants, möjliga överföringar och saknade kategorier.",
    });
  }

  const oppCount = input.opportunities.length;
  const headline =
    oppCount > 0
      ? `${oppCount} opportunities och ${input.reviewTotal} granskningsposter`
      : input.reviewTotal > 0
        ? `${input.reviewTotal} poster behöver din uppmärksamhet`
        : "Din finansiella översikt är uppdaterad";

  return { headline, items: items.slice(0, 4) };
}
