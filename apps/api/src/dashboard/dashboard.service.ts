import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import { calculateNetSavingsRate, calculateNetWorth } from "@ffos/financial-engine";
import type { DashboardResponse } from "@ffos/schemas";
import { getDb } from "../db/client";
import { accounts, financialEvents } from "../db/schema-economic";
import { HouseholdAccessService } from "../households/household-access.service";

@Injectable()
export class DashboardService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  async getDashboard(userId: string, householdId: string): Promise<DashboardResponse> {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const db = getDb();

    const accountRows = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.householdId, householdId), ne(accounts.isSystem, true)));

    const sumType = (...types: string[]) =>
      accountRows
        .filter((a) => types.includes(a.accountType))
        .reduce((acc, a) => acc + a.currentBalanceMinor, 0n);

    const availableCash = money(sumType("CHECKING", "SAVINGS", "CASH"), currency);
    const investments = money(sumType("INVESTMENT", "PENSION", "CRYPTO"), currency);
    const assetAccounts = money(sumType("ASSET"), currency);
    const debt = money(sumType("MORTGAGE", "LOAN", "CREDIT_CARD"), currency);
    const netWorth = calculateNetWorth({
      cash: availableCash,
      investments,
      assets: assetAccounts,
      liabilities: debt,
    });

    // Prefer calendar month of asOf; if empty (e.g. asOf=1st), fall back to previous month.
    const monthCandidates = [asOf.slice(0, 7)];
    const [y, m] = asOf.slice(0, 7).split("-").map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    monthCandidates.push(prev);

    let incomeMinor = 0n;
    let spendingMinor = 0n;
    for (const monthKey of monthCandidates) {
      const monthStart = `${monthKey}-01`;
      const monthEnd =
        monthKey === asOf.slice(0, 7) ? asOf : lastDayOfMonth(monthKey);
      const [totals] = await db
        .select({
          income: sql<string>`coalesce(sum(${financialEvents.incomeAmountMinor}), 0)`,
          spending: sql<string>`coalesce(sum(${financialEvents.expenseAmountMinor}), 0)`,
        })
        .from(financialEvents)
        .where(
          and(
            eq(financialEvents.householdId, householdId),
            gte(financialEvents.occurredOn, monthStart),
            lte(financialEvents.occurredOn, monthEnd),
          ),
        );
      incomeMinor = BigInt(totals?.income ?? "0");
      spendingMinor = BigInt(totals?.spending ?? "0");
      if (incomeMinor > 0n || spendingMinor > 0n) break;
    }

    const savingsMinor = incomeMinor - spendingMinor;
    const savingsRate = calculateNetSavingsRate({
      incomeMinor,
      spendingMinor,
    });

    const hour = new Date().getHours();
    const greeting =
      hour < 12 ? "God morgon" : hour < 18 ? "God eftermiddag" : "God kväll";

    const hasSeedData = accountRows.length > 0;

    return {
      greeting,
      asOf,
      householdName: household.name,
      position: {
        netWorth: moneyToJson(hasSeedData ? netWorth : money(4_821_439_00n, currency)),
        netWorthChangeMonth: moneyToJson(money(63_410_00n, currency)),
        availableCash: moneyToJson(
          hasSeedData ? availableCash : money(284_000_00n, currency),
        ),
        investments: moneyToJson(
          hasSeedData ? investments : money(1_180_000_00n, currency),
        ),
        debt: moneyToJson(hasSeedData ? debt : money(3_942_561_00n, currency)),
      },
      thisMonth: {
        income: moneyToJson(money(incomeMinor, currency)),
        spending: moneyToJson(money(spendingMinor, currency)),
        savings: moneyToJson(money(savingsMinor, currency)),
        savingsRatePercent: savingsRate,
        budgetRemaining: moneyToJson(
          money(
            spendingMinor > 0n ? 12_000_00n - (spendingMinor % 12_000_00n) : 6_200_00n,
            currency,
          ),
        ),
      },
      cashRunwayMonths:
        spendingMinor > 0n
          ? Number(availableCash.amountMinor) / Number(spendingMinor)
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
            detail:
              "Mat är cirka 14 % över din 12-månadersnivå den här månaden (seedad säsongs-/creep-signal).",
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
      coveragePercent: hasSeedData ? 94 : 40,
      freshnessLabel: hasSeedData
        ? "Seedad demodata · deterministisk"
        : "Ingen seed — placeholder",
    };
  }
}

function lastDayOfMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const date = new Date(Date.UTC(y, m, 0));
  return date.toISOString().slice(0, 10);
}
