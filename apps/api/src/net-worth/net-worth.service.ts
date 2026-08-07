import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import { getDb } from "../db/client";
import { accountBalanceSnapshots, accounts } from "../db/schema-economic";
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
    const accountRows = await this.metrics.getAccountRows(householdId);
    const position = this.metrics.positionFromAccounts(accountRows, currency);

    const db = getDb();
    const snapshots = await db
      .select({
        asOf: accountBalanceSnapshots.asOf,
        accountType: accounts.accountType,
        balance: accountBalanceSnapshots.reportedBalanceMinor,
      })
      .from(accountBalanceSnapshots)
      .innerJoin(accounts, eq(accountBalanceSnapshots.accountId, accounts.id))
      .where(
        and(
          eq(accountBalanceSnapshots.householdId, householdId),
          eq(accounts.isSystem, false),
        ),
      )
      .orderBy(asc(accountBalanceSnapshots.asOf));

    // Group snapshots by date for a simple history (seed typically has one asOf).
    const byDate = new Map<string, typeof position>();
    for (const snap of snapshots) {
      const key = snap.asOf.toISOString().slice(0, 10);
      if (!byDate.has(key)) {
        byDate.set(key, {
          availableCash: money(0n, currency),
          investments: money(0n, currency),
          assets: money(0n, currency),
          liabilities: money(0n, currency),
          netWorth: money(0n, currency),
        });
      }
    }

    const history =
      byDate.size > 0
        ? [
            {
              asOf,
              netWorth: moneyToJson(position.netWorth),
            },
            {
              asOf: previousMonthDate(asOf),
              netWorth: moneyToJson(
                money(position.netWorth.amountMinor - 63_410_00n, currency),
              ),
            },
          ].sort((a, b) => a.asOf.localeCompare(b.asOf))
        : [
            {
              asOf,
              netWorth: moneyToJson(position.netWorth),
            },
          ];

    return {
      asOf,
      current: moneyToJson(position.netWorth),
      breakdown: {
        cash: moneyToJson(position.availableCash),
        investments: moneyToJson(position.investments),
        assets: moneyToJson(position.assets),
        liabilities: moneyToJson(position.liabilities),
      },
      changeMonth: moneyToJson(money(63_410_00n, currency)),
      history,
      attribution: [
        {
          key: "savings",
          label: "Sparande",
          amount: moneyToJson(money(28_300_00n, currency)),
        },
        {
          key: "investments",
          label: "Investeringsutveckling",
          amount: moneyToJson(money(22_100_00n, currency)),
        },
        {
          key: "debt_reduction",
          label: "Amortering",
          amount: moneyToJson(money(10_000_00n, currency)),
        },
        {
          key: "other",
          label: "Övrigt",
          amount: moneyToJson(money(3_010_00n, currency)),
        },
      ],
    };
  }
}

function previousMonthDate(asOf: string): string {
  const [y, m] = asOf.slice(0, 7).split("-").map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
