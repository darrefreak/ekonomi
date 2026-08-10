import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type {
  IncomeObservation,
  MonthlyCostObservation,
  SinkingFundState,
  UpcomingObligation,
} from "@ffos/financial-engine";
import { getDb } from "../db/client";
import {
  accounts,
  categories,
  financialEvents,
} from "../db/schema-economic";
import { goals, sinkingFunds } from "../db/schema-planning";
import { householdSettings } from "../db/schema-ops";
import { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { resolveHouseholdAsOf } from "../common/as-of";

/**
 * Turns a household's real data into input for the pure intelligence engine.
 *
 * The engine in `packages/financial-engine/src/intelligence` never touches the
 * database — that is what lets it be tested against synthetic households — so
 * something has to read Postgres and shape the numbers. This is that something,
 * and it is the only place where the two meet.
 *
 * The critical decision here is *what counts as spending*, and it is not this
 * service's decision to make. It reads `financial_events.expense_amount_minor`,
 * which the ledger builders already set to zero for an internal transfer, a
 * credit-card payment, an investment transfer and mortgage principal. Summing
 * negative bank amounts instead would count a transfer between the household's
 * own accounts as money spent, and count a credit-card payment twice — once as
 * the purchase and again as the payment.
 *
 * See DEL 6 of the integration plan.
 */

export type MonthlySeries = {
  /** `YYYY-MM`, chronological, oldest first. */
  months: string[];
  costs: MonthlyCostObservation[];
  income: IncomeObservation[];
  /** Months where the household had no recorded activity at all. */
  emptyMonths: string[];
};

export type IntelligenceInput = {
  householdId: string;
  asOf: string;
  currency: string;
  series: MonthlySeries;
  upcomingObligations: UpcomingObligation[];
  sinkingFunds: SinkingFundState[];
  liquidCashMinor: bigint;
  coveragePercent: number;
  dataAgeDays: number;
  policy: {
    minimumCashBalanceMinor: bigint;
    emergencyFundTargetMinor: bigint;
    safetyMarginMinor: bigint;
  };
  /** What the input is built from, for the explainability surface. */
  provenance: {
    monthsOfHistory: number;
    firstMonth: string | null;
    lastMonth: string | null;
    categorisedShareBps: number | null;
    unknownNecessityShareBps: number | null;
  };
};

function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** Every month between two `YYYY-MM` values, inclusive, with no gaps. */
function monthRange(from: string, to: string): string[] {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  const start = fromYear! * 12 + (fromMonth! - 1);
  const end = toYear! * 12 + (toMonth! - 1);
  const months: string[] = [];
  for (let i = start; i <= end; i++) {
    months.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
  }
  return months;
}

@Injectable()
export class FinancialIntelligenceInputService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(HouseholdMetricsService) private readonly metrics: HouseholdMetricsService,
  ) {}

  /**
   * Build the engine's input for one household.
   *
   * Read-only throughout. Nothing here writes, and in particular nothing touches
   * `accounts.current_balance_minor`, which is a derived cache the ledger owns
   * (DEL 7).
   */
  async build(userId: string, householdId: string): Promise<IntelligenceInput> {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const asOf = await resolveHouseholdAsOf(householdId);

    const [settings] = await db
      .select()
      .from(householdSettings)
      .where(eq(householdSettings.householdId, householdId))
      .limit(1);

    /*
     * Monthly spending split by necessity, and income, in one pass.
     *
     * `expense_amount_minor` and `income_amount_minor` carry the economic meaning
     * the ledger assigned; a transfer contributes zero to both. Events with no
     * category fall into UNKNOWN necessity rather than being dropped, because
     * silently excluding uncategorised spending would understate the essentials a
     * buffer has to cover.
     */
    const rows = await db
      .select({
        month: sql<string>`to_char(${financialEvents.occurredOn}, 'YYYY-MM')`,
        necessity: sql<string>`coalesce(${categories.necessity}, 'UNKNOWN')`,
        expense: sql<string>`coalesce(sum(${financialEvents.expenseAmountMinor}), 0)`,
        income: sql<string>`coalesce(sum(${financialEvents.incomeAmountMinor}), 0)`,
        events: sql<number>`count(*)::int`,
        categorised: sql<number>`count(${financialEvents.categoryId})::int`,
      })
      .from(financialEvents)
      .leftJoin(categories, eq(financialEvents.categoryId, categories.id))
      .where(
        and(
          eq(financialEvents.householdId, householdId),
          eq(financialEvents.status, "ACTIVE"),
          lte(financialEvents.occurredOn, asOf),
        ),
      )
      .groupBy(
        sql`to_char(${financialEvents.occurredOn}, 'YYYY-MM')`,
        sql`coalesce(${categories.necessity}, 'UNKNOWN')`,
      )
      .orderBy(asc(sql`to_char(${financialEvents.occurredOn}, 'YYYY-MM')`));

    const byMonth = new Map<
      string,
      { essential: bigint; semi: bigint; discretionary: bigint; income: bigint }
    >();
    let totalEvents = 0;
    let categorisedEvents = 0;
    let unknownNecessityExpense = 0n;
    let totalExpense = 0n;

    for (const row of rows) {
      const entry =
        byMonth.get(row.month) ??
        { essential: 0n, semi: 0n, discretionary: 0n, income: 0n };
      const expense = BigInt(row.expense);
      const income = BigInt(row.income);
      totalEvents += row.events;
      categorisedEvents += row.categorised;
      totalExpense += expense;

      switch (row.necessity) {
        case "ESSENTIAL":
          entry.essential += expense;
          break;
        case "SEMI_DISCRETIONARY":
          entry.semi += expense;
          break;
        case "DISCRETIONARY":
          entry.discretionary += expense;
          break;
        default:
          /*
           * Uncategorised spending is treated as essential for buffer purposes.
           *
           * The conservative direction: a buffer sized on known essentials alone
           * would be too small if a third of the household's costs are simply not
           * classified yet. It is reported separately so the household can see how
           * much of the recommendation rests on unclassified spending.
           */
          entry.essential += expense;
          unknownNecessityExpense += expense;
          break;
      }
      entry.income += income;
      byMonth.set(row.month, entry);
    }

    const observedMonths = [...byMonth.keys()].sort();
    const months =
      observedMonths.length === 0
        ? []
        : monthRange(observedMonths[0]!, observedMonths[observedMonths.length - 1]!);

    const costs: MonthlyCostObservation[] = [];
    const income: IncomeObservation[] = [];
    const emptyMonths: string[] = [];
    for (const month of months) {
      const entry = byMonth.get(month);
      if (!entry) {
        // A month with no activity is a real zero, not a gap to skip: skipping it
        // would make a quiet month invisible and flatter the volatility measure.
        emptyMonths.push(month);
        costs.push({
          month,
          essentialMinor: 0n,
          semiDiscretionaryMinor: 0n,
          discretionaryMinor: 0n,
        });
        income.push({ month, amountMinor: 0n });
        continue;
      }
      costs.push({
        month,
        essentialMinor: entry.essential,
        semiDiscretionaryMinor: entry.semi,
        discretionaryMinor: entry.discretionary,
      });
      income.push({ month, amountMinor: entry.income });
    }

    // The month in progress is not a complete observation, so it is excluded from
    // the series the engine draws its normal levels from.
    const currentMonth = monthOf(asOf);
    const completeCosts = costs.filter((cost) => cost.month < currentMonth);
    const completeIncome = income.filter((entry) => entry.month < currentMonth);

    const [position, coverage] = await Promise.all([
      this.metrics.getFinancialSnapshot(householdId, "SEK", asOf),
      this.metrics.coverage(householdId, asOf).catch(() => null),
    ]);

    const funds = await db
      .select({
        name: sinkingFunds.name,
        targetMinor: sinkingFunds.targetMinor,
        reservedMinor: sinkingFunds.currentReservedMinor,
      })
      .from(sinkingFunds)
      .where(eq(sinkingFunds.householdId, householdId));

    const upcoming = await this.upcomingObligations(householdId, asOf);
    const dataAgeDays = await this.dataAgeDays(householdId, asOf);

    return {
      householdId,
      asOf,
      currency: "SEK",
      series: {
        months: completeCosts.map((cost) => cost.month),
        costs: completeCosts,
        income: completeIncome,
        emptyMonths,
      },
      upcomingObligations: upcoming,
      sinkingFunds: funds.map((fund) => ({
        label: fund.name,
        targetMinor: fund.targetMinor,
        fundedMinor: fund.reservedMinor,
      })),
      liquidCashMinor: BigInt(position.position.availableCash.amountMinor),
      coveragePercent: coverage?.percent ?? 0,
      dataAgeDays,
      policy: {
        minimumCashBalanceMinor: settings?.minimumCashBalanceMinor ?? 0n,
        emergencyFundTargetMinor: settings?.emergencyFundTargetMinor ?? 0n,
        safetyMarginMinor: settings?.safetyMarginMinor ?? 0n,
      },
      provenance: {
        monthsOfHistory: completeCosts.length,
        firstMonth: completeCosts[0]?.month ?? null,
        lastMonth: completeCosts[completeCosts.length - 1]?.month ?? null,
        categorisedShareBps:
          totalEvents === 0
            ? null
            : Math.round((categorisedEvents / totalEvents) * 10_000),
        unknownNecessityShareBps:
          totalExpense === 0n
            ? null
            : Number((unknownNecessityExpense * 10_000n) / totalExpense),
      },
    };
  }

  /**
   * Obligations inside the planning horizon.
   *
   * Goals with a target date are the only source available until recurring
   * detection is persisted; a projected recurring charge would otherwise be
   * counted here *and* inside the operating-cash component, which is the
   * double-count DEL 21 warns about.
   */
  private async upcomingObligations(
    householdId: string,
    asOf: string,
  ): Promise<UpcomingObligation[]> {
    const db = getDb();
    const horizon = new Date(Date.parse(`${asOf}T00:00:00Z`) + 90 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const rows = await db
      .select({
        name: goals.name,
        targetMinor: goals.targetMinor,
        currentMinor: goals.currentMinor,
        targetDate: goals.targetDate,
      })
      .from(goals)
      .where(
        and(
          eq(goals.householdId, householdId),
          eq(goals.status, "ACTIVE"),
          gte(goals.targetDate, asOf),
          lte(goals.targetDate, horizon),
        ),
      );
    return rows
      .filter((row) => row.targetDate !== null)
      .map((row) => ({
        label: row.name,
        // What remains, not the whole target: the funded part is already held.
        amountMinor:
          row.targetMinor - row.currentMinor > 0n
            ? row.targetMinor - row.currentMinor
            : 0n,
        dueDate: row.targetDate!,
        confidence: 80,
      }))
      .filter((obligation) => obligation.amountMinor > 0n);
  }

  /** Days between the newest recorded event and the household's today. */
  private async dataAgeDays(householdId: string, asOf: string): Promise<number> {
    const db = getDb();
    const [row] = await db
      .select({ newest: sql<string | null>`max(${financialEvents.occurredOn})` })
      .from(financialEvents)
      .where(
        and(
          eq(financialEvents.householdId, householdId),
          eq(financialEvents.status, "ACTIVE"),
        ),
      );
    if (!row?.newest) return 9999;
    const days = Math.round(
      (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${row.newest}T00:00:00Z`)) /
        86_400_000,
    );
    return days < 0 ? 0 : days;
  }

  /** Accounts that hold liquid cash, for the surface that explains the position. */
  async liquidAccounts(householdId: string) {
    const db = getDb();
    return db
      .select({
        id: accounts.id,
        name: accounts.name,
        accountType: accounts.accountType,
        currentBalanceMinor: accounts.currentBalanceMinor,
      })
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          isNull(accounts.archivedAt),
          sql`${accounts.accountType} in ('CHECKING', 'SAVINGS', 'CASH')`,
        ),
      );
  }
}
