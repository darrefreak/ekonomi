import { Inject, Injectable } from "@nestjs/common";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";

@Injectable()
export class NetWorthService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(HouseholdMetricsService)
    private readonly metrics: HouseholdMetricsService,
  ) {}

  async get(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const snap = await this.metrics.getFinancialSnapshot(
      householdId,
      currency,
      asOf,
    );

    const history = await this.metrics.netWorthHistoryFromSnapshots(
      householdId,
      currency,
      asOf,
    );

    return {
      asOf,
      current: moneyToJson(snap.position.netWorth),
      breakdown: {
        cash: moneyToJson(snap.position.availableCash),
        investments: moneyToJson(snap.position.investments),
        assets: moneyToJson(snap.position.assets),
        liabilities: moneyToJson(snap.position.liabilities),
      },
      changeMonth: moneyToJson(money(snap.changeMonthMinor, currency)),
      history,
      attribution: snap.attribution.map((a) => ({
        key: a.key,
        label: a.label,
        amount: moneyToJson(money(a.amountMinor, currency)),
      })),
    };
  }
}
