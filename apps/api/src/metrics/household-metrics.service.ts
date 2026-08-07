import { Injectable } from "@nestjs/common";
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import {
  buildMonthlyCashflow,
  calculateFinancialCoverage,
  calculateNetWorth,
  comparePeriods,
  summarizePeriod,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import {
  accounts,
  categories,
  dataSources,
  financialEvents,
} from "../db/schema-economic";

@Injectable()
export class HouseholdMetricsService {
  async getAccountRows(householdId: string) {
    return getDb()
      .select()
      .from(accounts)
      .where(and(eq(accounts.householdId, householdId), ne(accounts.isSystem, true)));
  }

  positionFromAccounts(
    accountRows: Awaited<ReturnType<HouseholdMetricsService["getAccountRows"]>>,
    currency: CurrencyCode,
  ) {
    const sumType = (...types: string[]) =>
      accountRows
        .filter((a) => types.includes(a.accountType))
        .reduce((acc, a) => acc + a.currentBalanceMinor, 0n);

    const availableCash = money(sumType("CHECKING", "SAVINGS", "CASH"), currency);
    const investments = money(sumType("INVESTMENT", "PENSION", "CRYPTO"), currency);
    const assets = money(sumType("ASSET"), currency);
    const liabilities = money(sumType("MORTGAGE", "LOAN", "CREDIT_CARD"), currency);
    const netWorth = calculateNetWorth({
      cash: availableCash,
      investments,
      assets,
      liabilities,
    });
    return { availableCash, investments, assets, liabilities, netWorth };
  }

  async monthlyTotals(householdId: string, months: string[]) {
    const db = getDb();
    const start = `${months[0]}-01`;
    const endMonth = months[months.length - 1]!;
    const end = lastDayOfMonth(endMonth);
    const rows = await db
      .select({
        month: sql<string>`to_char(${financialEvents.occurredOn}, 'YYYY-MM')`,
        income: sql<string>`coalesce(sum(${financialEvents.incomeAmountMinor}), 0)`,
        spending: sql<string>`coalesce(sum(${financialEvents.expenseAmountMinor}), 0)`,
      })
      .from(financialEvents)
      .where(
        and(
          eq(financialEvents.householdId, householdId),
          gte(financialEvents.occurredOn, start),
          lte(financialEvents.occurredOn, end),
        ),
      )
      .groupBy(sql`to_char(${financialEvents.occurredOn}, 'YYYY-MM')`);

    const byMonth: Record<string, { incomeMinor: bigint; spendingMinor: bigint }> =
      {};
    for (const row of rows) {
      byMonth[row.month] = {
        incomeMinor: BigInt(row.income),
        spendingMinor: BigInt(row.spending),
      };
    }
    return buildMonthlyCashflow(months, byMonth);
  }

  async coverage(householdId: string, asOf: string) {
    const accountRows = await this.getAccountRows(householdId);
    const types = new Set(accountRows.map((a) => a.accountType));
    const db = getDb();
    const [insurance] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.householdId, householdId),
          eq(categories.key, "housing.insurance"),
        ),
      )
      .limit(1);

    const result = calculateFinancialCoverage({
      hasChecking: types.has("CHECKING"),
      hasSavings: types.has("SAVINGS"),
      hasCreditCard: types.has("CREDIT_CARD"),
      hasMortgage: types.has("MORTGAGE"),
      hasInvestments: types.has("INVESTMENT"),
      hasTaxAccount: types.has("TAX_ACCOUNT"),
      hasPension: types.has("PENSION"),
      hasInsuranceSignal: Boolean(insurance),
      hasCsn: false,
    });

    const sources = await db
      .select()
      .from(dataSources)
      .where(eq(dataSources.householdId, householdId));

    return {
      percent: result.percent,
      asOf,
      areas: result.areas,
      freshness: sources.map((s) => ({
        sourceName: s.name,
        status: s.connectionStatus,
        freshnessLabel: s.freshnessLabel,
        lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
      })),
    };
  }

  async cashflow(householdId: string, currency: CurrencyCode, asOf: string) {
    const months = lastNMonths(asOf, 12);
    const points = await this.monthlyTotals(householdId, months);
    const currentMonth = months[months.length - 1]!;
    const previousMonth = months[months.length - 2] ?? currentMonth;
    const currentPoints = points.filter((p) => p.month === currentMonth);
    const previousPoints = points.filter((p) => p.month === previousMonth);
    // If asOf is early in month and empty, use previous as current display month
    const current =
      currentPoints[0] &&
      (currentPoints[0].incomeMinor > 0n || currentPoints[0].spendingMinor > 0n)
        ? summarizePeriod(currentPoints)
        : summarizePeriod(previousPoints);
    const currentLabel =
      currentPoints[0] &&
      (currentPoints[0].incomeMinor > 0n || currentPoints[0].spendingMinor > 0n)
        ? currentMonth
        : previousMonth;
    const previous =
      currentLabel === previousMonth
        ? summarizePeriod(points.filter((p) => p.month === months[months.length - 3]))
        : summarizePeriod(previousPoints);
    const previousLabel =
      currentLabel === previousMonth
        ? (months[months.length - 3] ?? previousMonth)
        : previousMonth;
    const comparison = comparePeriods(current, previous);

    return {
      asOf,
      currency,
      points: points.map((p) => ({
        month: p.month,
        income: moneyToJson(money(p.incomeMinor, currency)),
        spending: moneyToJson(money(p.spendingMinor, currency)),
        savings: moneyToJson(money(p.savingsMinor, currency)),
      })),
      currentPeriod: {
        label: currentLabel,
        income: moneyToJson(money(current.incomeMinor, currency)),
        spending: moneyToJson(money(current.spendingMinor, currency)),
        savings: moneyToJson(money(current.savingsMinor, currency)),
      },
      previousPeriod: {
        label: previousLabel,
        income: moneyToJson(money(previous.incomeMinor, currency)),
        spending: moneyToJson(money(previous.spendingMinor, currency)),
        savings: moneyToJson(money(previous.savingsMinor, currency)),
      },
      comparison: {
        spendingDelta: moneyToJson(money(comparison.spendingDeltaMinor, currency)),
        incomeDelta: moneyToJson(money(comparison.incomeDeltaMinor, currency)),
        spendingDeltaPercent: comparison.spendingDeltaPercent,
      },
    };
  }
}

export function lastNMonths(asOf: string, n: number): string[] {
  const [y, m] = asOf.slice(0, 7).split("-").map(Number);
  const months: string[] = [];
  let year = y;
  let month = m;
  for (let i = 0; i < n; i += 1) {
    months.unshift(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return months;
}

export function lastDayOfMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
