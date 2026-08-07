import { Inject, Injectable } from "@nestjs/common";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import { calculateNetSavingsRate } from "@ffos/financial-engine";
import { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";

@Injectable()
export class ReportsService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(HouseholdMetricsService)
    private readonly metrics: HouseholdMetricsService,
  ) {}

  async monthly(userId: string, householdId: string, period?: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const month =
      period ??
      (() => {
        const d = new Date(`${asOf}T12:00:00.000Z`);
        d.setUTCMonth(d.getUTCMonth() - 1);
        return d.toISOString().slice(0, 7);
      })();

    const [point] = await this.metrics.monthlyTotals(householdId, [month]);
    const incomeMinor = point?.incomeMinor ?? 0n;
    const spendingMinor = point?.spendingMinor ?? 0n;
    const savingsMinor = incomeMinor - spendingMinor;
    const snap = await this.metrics.getFinancialSnapshot(
      householdId,
      currency,
      asOf,
    );
    const cats = await this.metrics.categorySpendComparison(
      householdId,
      [month],
      [month],
    );

    return {
      period: month,
      asOf,
      income: moneyToJson(money(incomeMinor, currency)),
      spending: moneyToJson(money(spendingMinor, currency)),
      savings: moneyToJson(money(savingsMinor, currency)),
      savingsRatePercent: calculateNetSavingsRate({
        incomeMinor,
        spendingMinor,
      }),
      netWorth: moneyToJson(snap.position.netWorth),
      netWorthChange: moneyToJson(money(snap.changeMonthMinor, currency)),
      topCategories: cats
        .filter((c) => c.recentMinor > 0n)
        .sort((a, b) => (a.recentMinor > b.recentMinor ? -1 : 1))
        .slice(0, 8)
        .map((c) => ({
          categoryKey: c.categoryKey,
          categoryName: c.categoryName,
          spending: moneyToJson(money(c.recentMinor, currency)),
        })),
    };
  }

  async yearly(userId: string, householdId: string, year?: number) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const y = year ?? Number(asOf.slice(0, 4));
    const months = Array.from({ length: 12 }, (_, i) =>
      `${y}-${String(i + 1).padStart(2, "0")}`,
    );
    const points = await this.metrics.monthlyTotals(householdId, months);
    let incomeMinor = 0n;
    let spendingMinor = 0n;
    const monthRows = points.map((p) => {
      incomeMinor += p.incomeMinor;
      spendingMinor += p.spendingMinor;
      return {
        period: p.month,
        income: moneyToJson(money(p.incomeMinor, currency)),
        spending: moneyToJson(money(p.spendingMinor, currency)),
        savings: moneyToJson(money(p.incomeMinor - p.spendingMinor, currency)),
      };
    });
    const savingsMinor = incomeMinor - spendingMinor;
    return {
      year: y,
      asOf,
      income: moneyToJson(money(incomeMinor, currency)),
      spending: moneyToJson(money(spendingMinor, currency)),
      savings: moneyToJson(money(savingsMinor, currency)),
      savingsRatePercent: calculateNetSavingsRate({
        incomeMinor,
        spendingMinor,
      }),
      months: monthRows,
    };
  }
}
