import { Inject, Injectable } from "@nestjs/common";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import type { DashboardResponse } from "@ffos/schemas";
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
  ) {}

  async getDashboard(userId: string, householdId: string): Promise<DashboardResponse> {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";

    const snap = await this.metrics.getFinancialSnapshot(
      householdId,
      currency,
      asOf,
    );
    const coverage = await this.metrics.coverage(householdId, asOf);
    const review = await this.review.list(userId, householdId);
    const budget = await this.planning.getBudget(householdId, currency, asOf);

    const hour = new Date().getHours();
    const greeting =
      hour < 12 ? "God morgon" : hour < 18 ? "God eftermiddag" : "God kväll";

    const hasSeedData = (await this.metrics.getAccountRows(householdId)).length > 0;
    const recentPoints = snap.cashflow.points.slice(-6);
    const mortgageKr = Math.round(Number(snap.mortgageSavingMinor) / 100);

    return {
      greeting,
      asOf,
      householdName: household.name,
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
      brief: {
        headline: "Tre saker förtjänar din uppmärksamhet",
        items: [
          {
            id: "food",
            title: "Utgifter jämfört med förra perioden",
            detail: `Utgifterna i ${snap.cashflow.currentPeriod.label} är ${snap.cashflow.comparison.spendingDeltaPercent}% jämfört med ${snap.cashflow.previousPeriod.label}.`,
          },
          {
            id: "mortgage",
            title: "Bolåneränta kan ses över",
            detail:
              snap.mortgageSavingMinor > 0n
                ? `En ränteförhandling (~10 % lägre räntekostnad) kan spara ungefär ${mortgageKr.toLocaleString("sv-SE")} kr/år baserat på senaste 12 månaderna.`
                : "Otillräcklig bolånehistorik för att uppskatta räntebesparing.",
          },
          {
            id: "review",
            title: `${review.total} poster behöver granskning`,
            detail: "Okända merchants, möjliga överföringar och saknade kategorier.",
          },
        ],
      },
      upcoming: snap.upcoming,
      coveragePercent: coverage.percent,
      freshnessLabel: hasSeedData
        ? coverage.freshness[0]?.freshnessLabel ?? "Seedad demodata"
        : "Ingen seed",
      cashflowPoints: recentPoints,
      coverageAreas: coverage.areas,
      reviewCount: review.total,
    };
  }
}
