import { Inject, Injectable } from "@nestjs/common";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import { calculateNetSavingsRate } from "@ffos/financial-engine";
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

    const accountRows = await this.metrics.getAccountRows(householdId);
    const position = this.metrics.positionFromAccounts(accountRows, currency);
    const cashflow = await this.metrics.cashflow(householdId, currency, asOf);
    const coverage = await this.metrics.coverage(householdId, asOf);
    const review = await this.review.list(userId, householdId);
    const budget = await this.planning.getBudget(householdId, currency, asOf);

    const incomeMinor = BigInt(cashflow.currentPeriod.income.amountMinor);
    const spendingMinor = BigInt(cashflow.currentPeriod.spending.amountMinor);
    const savingsMinor = incomeMinor - spendingMinor;
    const savingsRate = calculateNetSavingsRate({ incomeMinor, spendingMinor });

    const hour = new Date().getHours();
    const greeting =
      hour < 12 ? "God morgon" : hour < 18 ? "God eftermiddag" : "God kväll";

    const hasSeedData = accountRows.length > 0;
    const recentPoints = cashflow.points.slice(-6);

    return {
      greeting,
      asOf,
      householdName: household.name,
      position: {
        netWorth: moneyToJson(position.netWorth),
        netWorthChangeMonth: moneyToJson(money(63_410_00n, currency)),
        availableCash: moneyToJson(position.availableCash),
        investments: moneyToJson(position.investments),
        debt: moneyToJson(position.liabilities),
      },
      thisMonth: {
        income: moneyToJson(money(incomeMinor, currency)),
        spending: moneyToJson(money(spendingMinor, currency)),
        savings: moneyToJson(money(savingsMinor, currency)),
        savingsRatePercent: savingsRate,
        budgetRemaining: budget
          ? budget.totals.remaining
          : moneyToJson(money(0n, currency)),
      },
      cashRunwayMonths:
        spendingMinor > 0n
          ? Number(position.availableCash.amountMinor) / Number(spendingMinor)
          : 0,
      forecast: {
        days30: moneyToJson(money(18_400_00n, currency)),
        days60: moneyToJson(money(9_800_00n, currency)),
        days90: moneyToJson(money(-4_200_00n, currency)),
      },
      brief: {
        headline: "Tre saker förtjänar din uppmärksamhet",
        items: [
          {
            id: "food",
            title: "Matutgifter över normalnivå",
            detail: `Utgifterna i ${cashflow.currentPeriod.label} är ${cashflow.comparison.spendingDeltaPercent}% jämfört med ${cashflow.previousPeriod.label}.`,
          },
          {
            id: "mortgage",
            title: "Bolåneränta kan ses över",
            detail: "En ränteförhandling kan spara ungefär 9 800 kr/år.",
          },
          {
            id: "review",
            title: `${review.total} poster behöver granskning`,
            detail: "Okända merchants, möjliga överföringar och saknade kategorier.",
          },
        ],
      },
      upcoming: [
        {
          id: "mortgage-pay",
          title: "Bolån",
          date: "2026-08-12",
          amount: moneyToJson(money(15_800_00n, currency)),
          kind: "bill",
        },
        {
          id: "insurance",
          title: "Hemförsäkring",
          date: "2026-08-18",
          amount: moneyToJson(money(11_600_00n, currency)),
          kind: "bill",
        },
        {
          id: "salary",
          title: "Lön",
          date: "2026-08-25",
          amount: moneyToJson(money(68_000_00n, currency)),
          kind: "income",
        },
      ],
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
