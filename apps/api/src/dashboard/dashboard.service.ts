import { Inject, Injectable } from "@nestjs/common";
import { money, moneyToJson } from "@ffos/domain";
import { calculateNetWorth } from "@ffos/financial-engine";
import type { DashboardResponse } from "@ffos/schemas";
import { HouseholdAccessService } from "../households/household-access.service";

/**
 * Phase 1: realistic placeholder dashboard payload served by the API.
 * Full deterministic demo seed arrives in Phase 2.
 */
@Injectable()
export class DashboardService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  async getDashboard(userId: string, householdId: string): Promise<DashboardResponse> {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as "SEK";

    const cash = money(284_000_00n, currency);
    const investments = money(1_180_000_00n, currency);
    const assets = money(7_300_000_00n, currency);
    const debt = money(3_942_561_00n, currency);
    const netWorth = calculateNetWorth({ cash, investments, assets, liabilities: debt });

    const hour = new Date().getHours();
    const greeting =
      hour < 12 ? "God morgon" : hour < 18 ? "God eftermiddag" : "God kväll";

    return {
      greeting,
      asOf: process.env.DEMO_AS_OF_DATE ?? "2026-08-01",
      householdName: household.name,
      position: {
        netWorth: moneyToJson(netWorth),
        netWorthChangeMonth: moneyToJson(money(63_410_00n, currency)),
        availableCash: moneyToJson(cash),
        investments: moneyToJson(investments),
        debt: moneyToJson(debt),
      },
      thisMonth: {
        income: moneyToJson(money(82_400_00n, currency)),
        spending: moneyToJson(money(54_100_00n, currency)),
        savings: moneyToJson(money(28_300_00n, currency)),
        savingsRatePercent: 34.3,
        budgetRemaining: moneyToJson(money(6_200_00n, currency)),
      },
      cashRunwayMonths: 6.2,
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
            detail: "Mat är cirka 14 % över din 12-månadersnivå den här månaden.",
          },
          {
            id: "mortgage",
            title: "Bolåneränta kan ses över",
            detail: "En ränteförhandling kan spara ungefär 9 800 kr/år.",
          },
          {
            id: "buffer",
            title: "Över likviditetsmål",
            detail: "Cirka 38 000 kr ligger över din konfigurerade likviditetsbuffert.",
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
      coveragePercent: 94,
      freshnessLabel: "Demo-placeholder · uppdateras i Phase 2",
    };
  }
}
