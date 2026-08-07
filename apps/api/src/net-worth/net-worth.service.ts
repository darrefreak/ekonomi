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

    const priorAsOf = previousMonthDate(asOf);
    const priorNw = snap.position.netWorth.amountMinor - snap.changeMonthMinor;

    const history = [
      {
        asOf: priorAsOf,
        netWorth: moneyToJson(money(priorNw, currency)),
      },
      {
        asOf,
        netWorth: moneyToJson(snap.position.netWorth),
      },
    ].sort((a, b) => a.asOf.localeCompare(b.asOf));

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

function previousMonthDate(asOf: string): string {
  const [y, m] = asOf.slice(0, 7).split("-").map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
