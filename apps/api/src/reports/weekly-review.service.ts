import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { WeeklyReview } from "@ffos/schemas";
import { CalendarService } from "../calendar/calendar.service";
import { getDb } from "../db/client";
import { categories, financialEvents, merchants, sourceTransactions } from "../db/schema-economic";
import { recurringItems } from "../db/schema-planning";
import { ClassificationReviewService } from "../intelligence/classification-review.service";
import { FinancialIntelligenceService } from "../intelligence/financial-intelligence.service";
import { HouseholdAccessService } from "../households/household-access.service";
import { resolveHouseholdAsOf } from "../common/as-of";

/**
 * Weekly Review — the "what happened this week" narrative, computed from the
 * same sources the rest of the product uses: transactions for spending,
 * detected recurring streams for "nytt återkommande", the calendar for the
 * week ahead and the savings model for the progress line.
 */

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

@Injectable()
export class WeeklyReviewService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(CalendarService) private readonly calendar: CalendarService,
    @Inject(ClassificationReviewService)
    private readonly clusterReview: ClassificationReviewService,
    @Inject(FinancialIntelligenceService)
    private readonly intelligence: FinancialIntelligenceService,
  ) {}

  async get(userId: string, householdId: string): Promise<WeeklyReview> {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = household.baseCurrency || "SEK";
    const asOf = await resolveHouseholdAsOf(householdId);
    const from = addDays(asOf, -6);
    const prevFrom = addDays(asOf, -13);
    const prevTo = addDays(asOf, -7);
    const db = getDb();

    const totalsFor = async (start: string, end: string) => {
      const [row] = await db
        .select({
          spending: sql<string>`coalesce(sum(case when ${sourceTransactions.amountMinor} < 0 then -${sourceTransactions.amountMinor} else 0 end), 0)::text`,
          income: sql<string>`coalesce(sum(case when ${sourceTransactions.amountMinor} >= 0 then ${sourceTransactions.amountMinor} else 0 end), 0)::text`,
        })
        .from(sourceTransactions)
        .where(
          and(
            eq(sourceTransactions.householdId, householdId),
            eq(sourceTransactions.isExcluded, false),
            eq(sourceTransactions.isInternalTransfer, false),
            gte(sourceTransactions.bookingDate, start),
            lte(sourceTransactions.bookingDate, end),
          ),
        );
      return {
        spending: BigInt(row?.spending ?? "0"),
        income: BigInt(row?.income ?? "0"),
      };
    };

    const [thisWeek, previousWeek] = await Promise.all([
      totalsFor(from, asOf),
      totalsFor(prevFrom, prevTo),
    ]);

    const largest = await db
      .select({
        id: sourceTransactions.id,
        description: sourceTransactions.description,
        amountMinor: sourceTransactions.amountMinor,
        bookingDate: sourceTransactions.bookingDate,
        merchantName: merchants.canonicalName,
      })
      .from(sourceTransactions)
      .leftJoin(merchants, eq(sourceTransactions.merchantId, merchants.id))
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          eq(sourceTransactions.isExcluded, false),
          eq(sourceTransactions.isInternalTransfer, false),
          gte(sourceTransactions.bookingDate, from),
          lte(sourceTransactions.bookingDate, asOf),
          sql`${sourceTransactions.amountMinor} < 0`,
        ),
      )
      .orderBy(sql`${sourceTransactions.amountMinor} asc`)
      .limit(5);

    const categoryTotalsFor = async (start: string, end: string) => {
      const rows = await db
        .select({
          key: sql<string>`coalesce(${categories.key}, 'uncategorised')`,
          name: sql<string>`coalesce(${categories.name}, 'Okategoriserat')`,
          amount: sql<string>`sum(-${sourceTransactions.amountMinor})::text`,
        })
        .from(sourceTransactions)
        .leftJoin(categories, eq(sourceTransactions.categoryId, categories.id))
        .where(
          and(
            eq(sourceTransactions.householdId, householdId),
            eq(sourceTransactions.isExcluded, false),
            eq(sourceTransactions.isInternalTransfer, false),
            gte(sourceTransactions.bookingDate, start),
            lte(sourceTransactions.bookingDate, end),
            sql`${sourceTransactions.amountMinor} < 0`,
          ),
        )
        .groupBy(
          sql`coalesce(${categories.key}, 'uncategorised')`,
          sql`coalesce(${categories.name}, 'Okategoriserat')`,
        );
      return new Map(rows.map((row) => [row.key, { name: row.name, amount: BigInt(row.amount) }]));
    };

    const [currentCats, previousCats] = await Promise.all([
      categoryTotalsFor(from, asOf),
      categoryTotalsFor(prevFrom, prevTo),
    ]);
    const catKeys = new Set([...currentCats.keys(), ...previousCats.keys()]);
    const categoryChanges = [...catKeys]
      .map((key) => {
        const cur = currentCats.get(key);
        const prev = previousCats.get(key);
        const change = (cur?.amount ?? 0n) - (prev?.amount ?? 0n);
        return {
          categoryKey: key,
          categoryName: cur?.name ?? prev?.name ?? key,
          currentMinor: (cur?.amount ?? 0n).toString(),
          previousMinor: (prev?.amount ?? 0n).toString(),
          changeMinor: change.toString(),
        };
      })
      .filter((row) => row.changeMinor !== "0")
      .sort((a, b) => {
        const aAbs = BigInt(a.changeMinor) < 0n ? -BigInt(a.changeMinor) : BigInt(a.changeMinor);
        const bAbs = BigInt(b.changeMinor) < 0n ? -BigInt(b.changeMinor) : BigInt(b.changeMinor);
        return aAbs > bAbs ? -1 : 1;
      })
      .slice(0, 5);

    const newStreams = await db
      .select()
      .from(recurringItems)
      .where(
        and(
          eq(recurringItems.householdId, householdId),
          eq(recurringItems.direction, "OUTFLOW"),
          inArray(recurringItems.status, ["DETECTED", "CONFIRMED"]),
          gte(recurringItems.createdAt, new Date(Date.parse(`${addDays(asOf, -30)}T00:00:00Z`))),
        ),
      );

    const calendar = await this.calendar.get(userId, householdId, 7);
    const upcomingNextWeek = calendar.days
      .flatMap((day) => day.events)
      .slice(0, 6)
      .map((event) => ({
        title: event.title,
        date: event.date,
        amountMinor: event.amountMinor,
        confidence: event.confidence,
      }));

    const clusterReview = await this.clusterReview.list(userId, householdId);

    const monthStart = `${asOf.slice(0, 7)}-01`;
    const [monthTotals] = await db
      .select({
        income: sql<string>`coalesce(sum(${financialEvents.incomeAmountMinor}), 0)::text`,
        expense: sql<string>`coalesce(sum(${financialEvents.expenseAmountMinor}), 0)::text`,
      })
      .from(financialEvents)
      .where(
        and(
          eq(financialEvents.householdId, householdId),
          eq(financialEvents.status, "ACTIVE"),
          gte(financialEvents.occurredOn, monthStart),
          lte(financialEvents.occurredOn, asOf),
        ),
      );
    const monthToDate =
      BigInt(monthTotals?.income ?? "0") - BigInt(monthTotals?.expense ?? "0");

    const savingsTarget = await this.intelligence.savingsTarget(userId, householdId);

    return {
      asOf,
      currency,
      weekLabel: `${from} – ${asOf}`,
      from,
      to: asOf,
      spendingMinor: thisWeek.spending.toString(),
      incomeMinor: thisWeek.income.toString(),
      previousWeekSpendingMinor: previousWeek.spending.toString(),
      largestExpenses: largest.map((row) => ({
        transactionId: row.id,
        description: row.description ?? "Transaktion",
        merchantName: row.merchantName,
        amountMinor: row.amountMinor.toString(),
        date: row.bookingDate,
      })),
      categoryChanges,
      newRecurring: newStreams.map((stream) => {
        const perYear: Record<string, number> = {
          WEEKLY: 52,
          BIWEEKLY: 26,
          EVERY_4_WEEKS: 13,
          MONTHLY: 12,
          QUARTERLY: 4,
          SEMIANNUAL: 2,
          ANNUAL: 1,
          YEARLY: 1,
          VARIABLE_RECURRING: 12,
        };
        const base = stream.medianAmountMinor ?? stream.amountMinor;
        const magnitude = base < 0n ? -base : base;
        const monthly = (magnitude * BigInt(perYear[stream.cadence] ?? 12)) / 12n;
        return {
          recurringId: stream.id,
          name: stream.name,
          monthlyEquivalentMinor: monthly.toString(),
          firstSeenOn: stream.firstSeenOn,
        };
      }),
      upcomingNextWeek,
      reviewCount: clusterReview.total,
      savingsProgress: {
        monthToDateMinor: (monthToDate > 0n ? monthToDate : 0n).toString(),
        recommendedMonthlyMinor: savingsTarget.totalAllocatedMinor ?? null,
      },
    };
  }
}
