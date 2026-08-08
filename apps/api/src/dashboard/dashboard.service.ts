import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import { calculateAvailableToInvest } from "@ffos/financial-engine";
import type { DashboardResponse } from "@ffos/schemas";
import { DecisionsService } from "../decisions/decisions.service";
import { getDb } from "../db/client";
import { sinkingFunds } from "../db/schema-planning";
import { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { PlanningMetricsService } from "../planning/planning-metrics.service";
import { ReviewService } from "../review/review.service";
import { SettingsService } from "../settings/settings.service";

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
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  async getDashboard(
    userId: string,
    householdId: string,
    asOfInput?: string,
  ): Promise<DashboardResponse> {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = asOfInput ?? process.env.DEMO_AS_OF_DATE ?? "2026-08-01";

    const [snap, coverage, review, budget, opps, settings] = await Promise.all([
      this.metrics.getFinancialSnapshot(householdId, currency, asOf),
      this.metrics.coverage(householdId, asOf),
      this.review.list(userId, householdId),
      this.planning.getBudget(householdId, currency, asOf),
      this.decisions.opportunities(userId, householdId),
      this.settings.get(userId, householdId),
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
        estimateBasis: o.estimateBasis ?? null,
        confidence: o.confidence,
        effort: o.effort,
        risk: o.risk,
        priority: o.priority,
        status: o.status,
        category: o.category,
      }));

    const horizon30 = new Date(`${asOf}T00:00:00.000Z`);
    horizon30.setUTCDate(horizon30.getUTCDate() + 30);
    const horizon30Date = horizon30.toISOString().slice(0, 10);
    const upcoming30dOutflowMinor = snap.upcoming
      .filter(
        (u) =>
          (u.kind === "bill" || u.kind === "other") &&
          u.date >= asOf &&
          u.date <= horizon30Date,
      )
      .reduce((sum, u) => sum + BigInt(u.amount.amountMinor), 0n);

    const fundRows = await getDb()
      .select({ currentReservedMinor: sinkingFunds.currentReservedMinor })
      .from(sinkingFunds)
      .where(eq(sinkingFunds.householdId, householdId));
    const reservedSinkingFundMinor = fundRows.reduce(
      (sum, f) => sum + f.currentReservedMinor,
      0n,
    );

    const ati = calculateAvailableToInvest({
      availableCashMinor: snap.position.availableCash.amountMinor,
      minimumCashBalanceMinor: BigInt(
        settings.financialPolicies.minimumCashBalanceMinor,
      ),
      emergencyFundTargetMinor: BigInt(
        settings.financialPolicies.emergencyFundTargetMinor,
      ),
      safetyMarginMinor: BigInt(settings.financialPolicies.safetyMarginMinor),
      reservedSinkingFundMinor,
      upcoming30dOutflowMinor,
    });
    const availableToInvest = {
      amount: moneyToJson(money(ati.availableToInvestMinor, currency)),
      assumptions: ati.assumptions,
      deductions: {
        minimumCashBalance: moneyToJson(
          money(ati.deductions.minimumCashBalanceMinor, currency),
        ),
        emergencyFundTarget: moneyToJson(
          money(ati.deductions.emergencyFundTargetMinor, currency),
        ),
        safetyMargin: moneyToJson(
          money(ati.deductions.safetyMarginMinor, currency),
        ),
        reservedSinkingFunds: moneyToJson(
          money(ati.deductions.reservedSinkingFundMinor, currency),
        ),
        upcoming30dOutflows: moneyToJson(
          money(ati.deductions.upcoming30dOutflowMinor, currency),
        ),
        total: moneyToJson(money(ati.deductions.totalDeductedMinor, currency)),
      },
      disclaimer:
        "Policyberäkning av kassaöverskott — inte investeringsrådgivning.",
    };

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
      availableToInvest,
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
