import { Injectable } from "@nestjs/common";
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import {
  attributeNetWorthChange,
  buildMonthlyCashflow,
  calculateFinancialCoverage,
  calculateNetSavingsRate,
  calculateNetWorth,
  cashRunwayMonths,
  comparePeriods,
  estimateMortgageRateSavingMinor,
  forecastCashflowDeltas,
  summarizePeriod,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import {
  accounts,
  categories,
  dataSources,
  financialEvents,
} from "../db/schema-economic";
import { contracts, subscriptions } from "../db/schema-planning";

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

  async periodEventTotals(
    householdId: string,
    startDate: string,
    endDate: string,
  ) {
    const db = getDb();
    const [row] = await db
      .select({
        income: sql<string>`coalesce(sum(${financialEvents.incomeAmountMinor}), 0)`,
        spending: sql<string>`coalesce(sum(${financialEvents.expenseAmountMinor}), 0)`,
        netWorthDelta: sql<string>`coalesce(sum(${financialEvents.netWorthDeltaMinor}), 0)`,
        debtReduction: sql<string>`coalesce(sum(${financialEvents.debtReductionMinor}), 0)`,
      })
      .from(financialEvents)
      .where(
        and(
          eq(financialEvents.householdId, householdId),
          gte(financialEvents.occurredOn, startDate),
          lte(financialEvents.occurredOn, endDate),
        ),
      );
    return {
      incomeMinor: BigInt(row?.income ?? "0"),
      spendingMinor: BigInt(row?.spending ?? "0"),
      netWorthDeltaMinor: BigInt(row?.netWorthDelta ?? "0"),
      debtReductionMinor: BigInt(row?.debtReduction ?? "0"),
    };
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

  resolveCurrentMonthLabel(
    months: string[],
    points: Array<{ month: string; incomeMinor: bigint; spendingMinor: bigint }>,
  ) {
    const currentMonth = months[months.length - 1]!;
    const previousMonth = months[months.length - 2] ?? currentMonth;
    const currentPoints = points.filter((p) => p.month === currentMonth);
    const hasActivity =
      currentPoints[0] &&
      (currentPoints[0].incomeMinor > 0n || currentPoints[0].spendingMinor > 0n);
    return {
      currentLabel: hasActivity ? currentMonth : previousMonth,
      previousLabel: hasActivity
        ? previousMonth
        : (months[months.length - 3] ?? previousMonth),
    };
  }

  async cashflow(householdId: string, currency: CurrencyCode, asOf: string) {
    const months = lastNMonths(asOf, 12);
    const points = await this.monthlyTotals(householdId, months);
    const { currentLabel, previousLabel } = this.resolveCurrentMonthLabel(
      months,
      points,
    );
    const current = summarizePeriod(points.filter((p) => p.month === currentLabel));
    const previous = summarizePeriod(
      points.filter((p) => p.month === previousLabel),
    );
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

  /**
   * Shared financial snapshot for dashboard + net-worth (same asOf / definitions).
   */
  async getFinancialSnapshot(householdId: string, currency: CurrencyCode, asOf: string) {
    const accountRows = await this.getAccountRows(householdId);
    const position = this.positionFromAccounts(accountRows, currency);
    const cashflow = await this.cashflow(householdId, currency, asOf);
    const monthLabel = cashflow.currentPeriod.label;
    const monthStart = `${monthLabel}-01`;
    const monthEnd = lastDayOfMonth(monthLabel);
    const periodTotals = await this.periodEventTotals(
      householdId,
      monthStart,
      monthEnd,
    );
    const { changeMonthMinor, attribution } =
      attributeNetWorthChange(periodTotals);
    const incomeMinor = BigInt(cashflow.currentPeriod.income.amountMinor);
    const spendingMinor = BigInt(cashflow.currentPeriod.spending.amountMinor);
    const savingsMinor = incomeMinor - spendingMinor;
    const savingsRate = calculateNetSavingsRate({ incomeMinor, spendingMinor });
    const runway = cashRunwayMonths({
      availableCashMinor: position.availableCash.amountMinor,
      monthlySpendingMinor: spendingMinor,
    });
    const forecastDeltas = forecastCashflowDeltas({
      startingCashMinor: position.availableCash.amountMinor,
      startingNetWorthMinor: position.netWorth.amountMinor,
      monthlyNetSavingsMinor: savingsMinor,
      asOf,
    });

    const annualInterest = await this.mortgageInterestAnnual(
      householdId,
      asOf,
    );
    const mortgageSavingMinor = estimateMortgageRateSavingMinor(annualInterest);

    const upcoming = await this.upcomingObligations(householdId, currency, asOf);

    return {
      asOf,
      currency,
      position,
      cashflow,
      periodTotals,
      changeMonthMinor,
      attribution,
      incomeMinor,
      spendingMinor,
      savingsMinor,
      savingsRate,
      runway,
      forecastDeltas,
      mortgageSavingMinor,
      upcoming,
      monthLabel,
    };
  }

  async mortgageInterestAnnual(householdId: string, asOf: string) {
    const end = asOf.slice(0, 10);
    const startDate = new Date(`${end}T00:00:00.000Z`);
    startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
    const start = startDate.toISOString().slice(0, 10);
    const totals = await this.periodEventTotals(householdId, start, end);
    // Approximate: spending on mortgage interest ≈ expense with debt reduction present.
    // Prefer sum of expense where debtReduction > 0 in window.
    const db = getDb();
    const [row] = await db
      .select({
        interest: sql<string>`coalesce(sum(${financialEvents.expenseAmountMinor}), 0)`,
      })
      .from(financialEvents)
      .where(
        and(
          eq(financialEvents.householdId, householdId),
          gte(financialEvents.occurredOn, start),
          lte(financialEvents.occurredOn, end),
          sql`${financialEvents.debtReductionMinor} > 0`,
        ),
      );
    const interest = BigInt(row?.interest ?? "0");
    return interest > 0n ? interest : totals.spendingMinor / 12n;
  }

  async upcomingObligations(
    householdId: string,
    currency: CurrencyCode,
    asOf: string,
  ) {
    const db = getDb();
    const horizon = new Date(`${asOf}T00:00:00.000Z`);
    horizon.setUTCDate(horizon.getUTCDate() + 45);
    const horizonDate = horizon.toISOString().slice(0, 10);

    const subs = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.householdId, householdId),
          eq(subscriptions.status, "ACTIVE"),
          gte(subscriptions.nextChargeOn, asOf),
          lte(subscriptions.nextChargeOn, horizonDate),
        ),
      );

    const cons = await db
      .select()
      .from(contracts)
      .where(eq(contracts.householdId, householdId));

    const items: Array<{
      id: string;
      title: string;
      date: string;
      amount: ReturnType<typeof moneyToJson>;
      kind: "bill" | "income" | "transfer" | "other";
    }> = [];

    for (const s of subs) {
      if (!s.nextChargeOn) continue;
      items.push({
        id: `sub-${s.id}`,
        title: s.name,
        date: s.nextChargeOn,
        amount: moneyToJson(money(s.amountMinor, currency)),
        kind: "bill",
      });
    }

    for (const c of cons) {
      const date = c.renewalDate ?? c.cancellationDeadline ?? c.endDate;
      if (!date || date < asOf || date > horizonDate) continue;
      const amountMinor =
        c.monthlyCostMinor ??
        (c.annualCostMinor != null ? c.annualCostMinor / 12n : 0n);
      items.push({
        id: `contract-${c.id}`,
        title: c.name || c.provider,
        date,
        amount: moneyToJson(money(amountMinor, currency)),
        kind: "bill",
      });
    }

    // Deterministic salary estimate from latest month income event pattern
    const salaryDate = nextDayOfMonth(asOf, 25);
    if (salaryDate <= horizonDate) {
      const monthLabel = asOf.slice(0, 7);
      const totals = await this.periodEventTotals(
        householdId,
        `${monthLabel}-01`,
        lastDayOfMonth(monthLabel),
      );
      // Use previous full month salaries if current incomplete
      const prev = previousMonthLabel(monthLabel);
      const prevTotals = await this.periodEventTotals(
        householdId,
        `${prev}-01`,
        lastDayOfMonth(prev),
      );
      const income =
        totals.incomeMinor > 0n ? totals.incomeMinor : prevTotals.incomeMinor;
      if (income > 0n) {
        items.push({
          id: "salary-next",
          title: "Löner (estimerat)",
          date: salaryDate,
          amount: moneyToJson(money(income, currency)),
          kind: "income",
        });
      }
    }

    items.sort((a, b) => a.date.localeCompare(b.date));
    return items.slice(0, 8);
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

function previousMonthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

function nextDayOfMonth(asOf: string, day: number): string {
  const [y, m] = asOf.slice(0, 7).split("-").map(Number);
  const asOfDay = Number(asOf.slice(8, 10));
  if (asOfDay <= day) {
    return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
