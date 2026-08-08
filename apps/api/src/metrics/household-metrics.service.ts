import { Injectable } from "@nestjs/common";
import { and, asc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import {
  attributeNetWorthChange,
  bucketBalancesForNetWorth,
  buildMonthlyCashflow,
  calculateFinancialCoverage,
  computeFreshnessLabel,
  summarizeFreshness,
  calculateNetSavingsRate,
  calculateNetWorth,
  cashRunwayMonths,
  comparePeriods,
  estimateMortgageRateSavingMinor,
  forecastCashflowDeltas,
  METRIC_BUNDLE_VERSION,
  metricInputHash,
  monthEndDates,
  netWorthFromTypedBalances,
  reconstructBalances,
  summarizePeriod,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import {
  accountBalanceSnapshots,
  accounts,
  categories,
  dataSources,
  financialEvents,
  ledgerEntries,
  ledgerPostings,
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

  /**
   * Account rows with balances forced to ledger reconstruction
   * (openings + postings). Cache fields are ignored for financial truth.
   */
  async getLedgerAlignedAccountRows(householdId: string) {
    const accountRows = await this.getAccountRows(householdId);
    const db = getDb();
    const postingRows = await db
      .select({
        accountId: ledgerPostings.accountId,
        side: ledgerPostings.side,
        amountMinor: ledgerPostings.amountMinor,
      })
      .from(ledgerPostings)
      .where(eq(ledgerPostings.householdId, householdId));

    const ledger = reconstructBalances({
      openings: accountRows.map((a) => ({
        accountId: a.id,
        accountType: a.accountType,
        openingMinor: a.openingBalanceMinor,
      })),
      postings: postingRows.map((p) => ({
        accountId: p.accountId,
        side: p.side as "debit" | "credit",
        amountMinor: p.amountMinor,
      })),
    });

    return accountRows.map((a) => ({
      ...a,
      currentBalanceMinor: ledger.get(a.id) ?? a.openingBalanceMinor,
    }));
  }

  positionFromAccounts(
    accountRows: Awaited<ReturnType<HouseholdMetricsService["getAccountRows"]>>,
    currency: CurrencyCode,
  ) {
    const buckets = bucketBalancesForNetWorth(
      accountRows.map((a) => ({
        accountType: a.accountType,
        balanceMinor: a.currentBalanceMinor,
      })),
      currency,
    );
    const netWorth = calculateNetWorth(buckets);
    return {
      availableCash: buckets.cash,
      investments: buckets.investments,
      assets: buckets.assets,
      liabilities: buckets.liabilities,
      netWorth,
    };
  }

  /**
   * Drop reconstructed NW history snapshots so the next ensure rebuilds from ledger.
   * Called after financial mutations so history cannot stay stuck on pre-mutation inserts.
   */
  async invalidateNetWorthHistorySnapshots(householdId: string) {
    const db = getDb();
    await db
      .delete(accountBalanceSnapshots)
      .where(
        and(
          eq(accountBalanceSnapshots.householdId, householdId),
          eq(accountBalanceSnapshots.source, "nw_history_reconstruct"),
        ),
      );
  }

  /**
   * Build / refresh NW history from account_balance_snapshots.
   * Always upserts month-end balances reconstructed from ledger (not insert-only).
   */
  async ensureNetWorthHistorySnapshots(
    householdId: string,
    asOf: string,
    monthsBack = 6,
  ) {
    const db = getDb();
    const accountRows = await this.getAccountRows(householdId);
    if (!accountRows.length) return;

    const dates = monthEndDates(asOf, monthsBack);

    const postingRows = await db
      .select({
        accountId: ledgerPostings.accountId,
        side: ledgerPostings.side,
        amountMinor: ledgerPostings.amountMinor,
        bookedOn: ledgerEntries.bookedOn,
      })
      .from(ledgerPostings)
      .innerJoin(ledgerEntries, eq(ledgerPostings.ledgerEntryId, ledgerEntries.id))
      .where(eq(ledgerPostings.householdId, householdId));

    // Authoritative openings from persisted account.openingBalanceMinor.
    const openings = accountRows.map((a) => ({
      accountId: a.id,
      accountType: a.accountType,
      openingMinor: a.openingBalanceMinor,
    }));

    for (const date of dates) {
      const postingsToDate = postingRows
        .filter((p) => p.bookedOn <= date)
        .map((p) => ({
          accountId: p.accountId,
          side: p.side as "debit" | "credit",
          amountMinor: p.amountMinor,
        }));
      const balances = reconstructBalances({ openings, postings: postingsToDate });
      const asOfDate = new Date(`${date}T12:00:00.000Z`);

      // Replace prior reconstructed rows for this calendar day so postings stay fresh.
      await db
        .delete(accountBalanceSnapshots)
        .where(
          and(
            eq(accountBalanceSnapshots.householdId, householdId),
            eq(accountBalanceSnapshots.source, "nw_history_reconstruct"),
            sql`(${accountBalanceSnapshots.asOf} AT TIME ZONE 'UTC')::date = ${date}::date`,
          ),
        );

      for (const a of accountRows) {
        if (a.accountType === "EXPENSE" || a.accountType === "INCOME") continue;
        const bal =
          balances.get(a.id) ??
          openings.find((o) => o.accountId === a.id)!.openingMinor;
        await db.insert(accountBalanceSnapshots).values({
          householdId,
          accountId: a.id,
          reportedBalanceMinor: bal,
          availableBalanceMinor: bal,
          ledgerCalculatedBalanceMinor: bal,
          reconciledBalanceMinor: bal,
          asOf: asOfDate,
          source: "nw_history_reconstruct",
          confidence: "1",
          userVerified: false,
          isEstimated: date !== asOf.slice(0, 10),
        });
      }
    }
  }

  async netWorthHistoryFromSnapshots(
    householdId: string,
    currency: CurrencyCode,
    asOf: string,
  ) {
    await this.ensureNetWorthHistorySnapshots(householdId, asOf, 6);
    const db = getDb();
    const rows = await db
      .select({
        asOf: accountBalanceSnapshots.asOf,
        accountId: accountBalanceSnapshots.accountId,
        balanceMinor: accountBalanceSnapshots.ledgerCalculatedBalanceMinor,
        accountType: accounts.accountType,
      })
      .from(accountBalanceSnapshots)
      .innerJoin(accounts, eq(accountBalanceSnapshots.accountId, accounts.id))
      .where(
        and(
          eq(accountBalanceSnapshots.householdId, householdId),
          ne(accounts.isSystem, true),
        ),
      )
      .orderBy(asc(accountBalanceSnapshots.asOf));

    const byDate = new Map<string, Array<{ accountType: string; balanceMinor: bigint }>>();
    for (const row of rows) {
      if (row.accountType === "EXPENSE" || row.accountType === "INCOME") continue;
      const key = row.asOf.toISOString().slice(0, 10);
      const list = byDate.get(key) ?? [];
      list.push({
        accountType: row.accountType,
        balanceMinor: row.balanceMinor ?? 0n,
      });
      byDate.set(key, list);
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, balances]) => ({
        asOf: date,
        netWorth: moneyToJson(netWorthFromTypedBalances(balances, currency)),
        source: "account_balance_snapshots" as const,
      }));
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

  /** Average monthly spend by category for recent window vs baseline window. */
  async categorySpendComparison(
    householdId: string,
    recentMonths: string[],
    baselineMonths: string[],
  ) {
    if (!recentMonths.length || !baselineMonths.length) return [];
    const db = getDb();
    const load = async (months: string[]) => {
      const start = `${months[0]}-01`;
      const end = lastDayOfMonth(months[months.length - 1]!);
      const rows = await db
        .select({
          categoryKey: categories.key,
          categoryName: categories.name,
          total: sql<string>`coalesce(sum(${financialEvents.expenseAmountMinor}), 0)`,
        })
        .from(financialEvents)
        .innerJoin(categories, eq(financialEvents.categoryId, categories.id))
        .where(
          and(
            eq(financialEvents.householdId, householdId),
            gte(financialEvents.occurredOn, start),
            lte(financialEvents.occurredOn, end),
          ),
        )
        .groupBy(categories.key, categories.name);
      return rows;
    };
    const [recentRows, baselineRows] = await Promise.all([
      load(recentMonths),
      load(baselineMonths),
    ]);
    const map = new Map<
      string,
      { categoryKey: string; categoryName: string; recent: bigint; baseline: bigint }
    >();
    for (const r of recentRows) {
      map.set(r.categoryKey, {
        categoryKey: r.categoryKey,
        categoryName: r.categoryName,
        recent: BigInt(r.total),
        baseline: 0n,
      });
    }
    for (const r of baselineRows) {
      const prev = map.get(r.categoryKey) ?? {
        categoryKey: r.categoryKey,
        categoryName: r.categoryName,
        recent: 0n,
        baseline: 0n,
      };
      prev.baseline = BigInt(r.total);
      map.set(r.categoryKey, prev);
    }
    const recentN = BigInt(recentMonths.length);
    const baselineN = BigInt(baselineMonths.length);
    return [...map.values()].map((r) => ({
      categoryKey: r.categoryKey,
      categoryName: r.categoryName,
      recentMinor: recentN > 0n ? r.recent / recentN : 0n,
      baselineMinor: baselineN > 0n ? r.baseline / baselineN : 0n,
    }));
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

    const sources = await db
      .select()
      .from(dataSources)
      .where(eq(dataSources.householdId, householdId));

    const activeSources = sources.filter((s) => !s.archivedAt);
    const hasCsn =
      accountRows.some(
        (a) =>
          (a.accountType === "LOAN" || a.accountType === "OTHER") &&
          `${a.provider ?? ""} ${a.name}`.toLowerCase().includes("csn"),
      ) ||
      activeSources.some((s) => s.providerId.toLowerCase().includes("csn"));

    const result = calculateFinancialCoverage({
      hasChecking: types.has("CHECKING"),
      hasSavings: types.has("SAVINGS"),
      hasCreditCard: types.has("CREDIT_CARD"),
      hasMortgage: types.has("MORTGAGE"),
      hasInvestments: types.has("INVESTMENT"),
      hasTaxAccount: types.has("TAX_ACCOUNT"),
      hasPension: types.has("PENSION"),
      hasInsuranceSignal: Boolean(insurance),
      hasCsn,
    });

    const freshness = activeSources.map((s) => {
      const label = computeFreshnessLabel({
        lastSyncedAt: s.lastSyncedAt,
        connectionStatus: s.connectionStatus,
        asOf,
      });
      return {
        sourceName: s.name,
        status: s.connectionStatus,
        freshnessLabel: label,
        lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
      };
    });

    return {
      percent: result.percent,
      asOf,
      areas: result.areas,
      freshness,
      freshnessSummary: summarizeFreshness(
        activeSources.map((s) => ({
          connectionStatus: s.connectionStatus,
          freshnessLabel: null,
          lastSyncedAt: s.lastSyncedAt,
        })),
        asOf,
      ),
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
    const accountRows = await this.getLedgerAlignedAccountRows(householdId);
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

    const inputHash = metricInputHash([
      householdId,
      asOf,
      METRIC_BUNDLE_VERSION,
      accountRows.length,
      position.netWorth.amountMinor,
      position.availableCash.amountMinor,
      position.investments.amountMinor,
      position.assets.amountMinor,
      position.liabilities.amountMinor,
      incomeMinor,
      spendingMinor,
      monthLabel,
    ]);

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
      /** Shared registry metadata — all consumers must surface the same bundle. */
      metricMeta: {
        bundleVersion: METRIC_BUNDLE_VERSION,
        calculationVersion: METRIC_BUNDLE_VERSION,
        inputHash,
        asOf,
      },
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
