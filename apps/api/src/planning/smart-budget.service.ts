import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type {
  AdoptSmartBudgetInput,
  SmartBudgetContributor,
  SmartBudgetGroup,
  SmartBudgetGroupKey,
  SmartBudgetResponse,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { categories, financialEvents, sourceTransactions } from "../db/schema-economic";
import {
  expectedTransactions,
  goalContributions,
  goals,
  recurringItems,
  sinkingFunds,
  smartBudgets,
} from "../db/schema-planning";
import { FinancialIntelligenceInputService } from "../intelligence/financial-intelligence-input.service";
import { FinancialIntelligenceService } from "../intelligence/financial-intelligence.service";
import { HouseholdAccessService } from "../households/household-access.service";

/**
 * Smart Budget — six conceptual groups suggested from the household's own
 * history instead of fifty empty category rows.
 *
 * Every number is deterministic and carries its basis. The double-counting
 * hazard is taken seriously: recurring commitments live in the FIXED and
 * IRREGULAR groups, so the variable groups subtract the recurring overlap from
 * their historical baselines — rent detected as recurring is not also part of
 * the "essential variable" suggestion, and a subscription is not also
 * "flexible spending".
 *
 * The suggestion is recomputed on every read. Only the adopted plan (the six
 * amounts the user accepted or adjusted) is stored.
 */

const GROUP_META: Record<
  SmartBudgetGroupKey,
  { name: string; description: string }
> = {
  essential_fixed: {
    name: "Fasta åtaganden",
    description:
      "Boende, lån, försäkringar, abonnemang och andra återkommande åtaganden.",
  },
  essential_variable: {
    name: "Nödvändigt & rörligt",
    description: "Mat, drivmedel och andra nödvändiga kostnader som varierar.",
  },
  irregular: {
    name: "Oregelbundet",
    description:
      "Års- och kvartalsräkningar utslagna per månad, plus buffertposter.",
  },
  flexible: {
    name: "Flexibelt",
    description: "Nöje, restauranger och övrig valfri konsumtion.",
  },
  goals: {
    name: "Mål",
    description: "Planerade månadsbidrag till aktiva sparmål.",
  },
  savings: {
    name: "Sparande",
    description: "Rekommenderad sparallokering enligt sparmodellen.",
  },
};

/** Payments per year per cadence; VARIABLE_RECURRING is monthly-ish. */
const PERIODS_PER_YEAR: Record<string, number> = {
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

const IRREGULAR_CADENCES = new Set(["QUARTERLY", "SEMIANNUAL", "ANNUAL", "YEARLY"]);

/** Recurring types that are commitments even without a category (fallback). */
const NON_ESSENTIAL_TYPES = new Set(["SUBSCRIPTION", "MEMBERSHIP"]);

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function medianMinor(values: bigint[]): bigint | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2n;
}

function averageMinor(values: bigint[]): bigint | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0n) / BigInt(values.length);
}

function lastDayOfMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year!, m!, 0));
  return last.toISOString().slice(0, 10);
}

function formatKr(minor: bigint): string {
  const kronor = minor / 100n;
  return `${kronor.toLocaleString("sv-SE")} kr`;
}

@Injectable()
export class SmartBudgetService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(FinancialIntelligenceInputService)
    private readonly input: FinancialIntelligenceInputService,
    @Inject(FinancialIntelligenceService)
    private readonly intelligence: FinancialIntelligenceService,
  ) {}

  async get(
    userId: string,
    householdId: string,
    monthInput?: string,
  ): Promise<SmartBudgetResponse> {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const input = await this.input.build(userId, householdId);
    const asOf = input.asOf;
    const currency = input.currency;
    const month = monthInput ?? asOf.slice(0, 7);
    const monthStart = `${month}-01`;
    const monthEnd = lastDayOfMonth(month);
    const isCurrentMonth = asOf.slice(0, 7) === month;
    const isPastMonth = month < asOf.slice(0, 7);

    // ---- Recurring commitments --------------------------------------------
    const streams = await db
      .select()
      .from(recurringItems)
      .where(
        and(
          eq(recurringItems.householdId, householdId),
          eq(recurringItems.direction, "OUTFLOW"),
          inArray(recurringItems.status, ["DETECTED", "CONFIRMED"]),
        ),
      );

    const categoryRows = await db
      .select({ id: categories.id, necessity: categories.necessity })
      .from(categories)
      .where(eq(categories.householdId, householdId));
    const necessityByCategory = new Map(
      categoryRows.map((row) => [row.id, row.necessity ?? "UNKNOWN"]),
    );

    type StreamView = {
      id: string;
      name: string;
      monthlyMinor: bigint;
      irregular: boolean;
      essential: boolean;
      signature: string | null;
    };
    const streamViews: StreamView[] = streams.map((stream) => {
      const perYear = PERIODS_PER_YEAR[stream.cadence] ?? 12;
      const base = abs(stream.medianAmountMinor ?? stream.amountMinor);
      const monthlyMinor = (base * BigInt(perYear)) / 12n;
      const necessity = stream.categoryId
        ? necessityByCategory.get(stream.categoryId) ?? "UNKNOWN"
        : "UNKNOWN";
      const essential =
        necessity === "ESSENTIAL" ||
        (necessity === "UNKNOWN" &&
          !stream.isSubscription &&
          !NON_ESSENTIAL_TYPES.has(stream.recurringType ?? ""));
      return {
        id: stream.id,
        name: stream.name,
        monthlyMinor,
        irregular: IRREGULAR_CADENCES.has(stream.cadence),
        essential,
        signature: stream.signature,
      };
    });

    const fixedStreams = streamViews.filter((s) => !s.irregular);
    const irregularStreams = streamViews.filter((s) => s.irregular);
    const fixedTotal = fixedStreams.reduce((sum, s) => sum + s.monthlyMinor, 0n);
    const irregularRecurringTotal = irregularStreams.reduce(
      (sum, s) => sum + s.monthlyMinor,
      0n,
    );
    // Overlap the variable baselines must not double count.
    const essentialRecurringMonthly = streamViews
      .filter((s) => s.essential)
      .reduce((sum, s) => sum + s.monthlyMinor, 0n);
    const nonEssentialRecurringMonthly = streamViews
      .filter((s) => !s.essential)
      .reduce((sum, s) => sum + s.monthlyMinor, 0n);

    // ---- Historical baselines by necessity --------------------------------
    const window = input.series.costs.slice(-24);
    const essentialSeries = window.map((m) => m.essentialMinor);
    const flexibleSeries = window.map(
      (m) => m.semiDiscretionaryMinor + m.discretionaryMinor,
    );
    const incomeSeries = input.series.income.slice(-24).map((m) => m.amountMinor);
    const totalSeries = window.map(
      (m) => m.essentialMinor + m.semiDiscretionaryMinor + m.discretionaryMinor,
    );

    const essentialMedian = medianMinor(essentialSeries.filter((v) => v > 0n));
    const essentialLatest3 = averageMinor(essentialSeries.slice(-3));
    const flexibleMedian = medianMinor(flexibleSeries.filter((v) => v > 0n));
    const flexibleLatest3 = averageMinor(flexibleSeries.slice(-3));
    const expectedIncome = medianMinor(incomeSeries.filter((v) => v > 0n)) ?? 0n;

    // ---- Seasonality: this calendar month vs a normal month ---------------
    const targetCalendarMonth = Number(month.slice(5, 7));
    const sameMonthTotals: bigint[] = [];
    input.series.costs.forEach((m) => {
      if (Number(m.month.slice(5, 7)) !== targetCalendarMonth) return;
      const total = m.essentialMinor + m.semiDiscretionaryMinor + m.discretionaryMinor;
      if (total > 0n) sameMonthTotals.push(total);
    });
    const overallMedian = medianMinor(totalSeries.filter((v) => v > 0n));
    let seasonalFactor: number | null = null;
    if (sameMonthTotals.length >= 2 && overallMedian && overallMedian > 0n) {
      const sameMedian = medianMinor(sameMonthTotals)!;
      const raw = Number(sameMedian) / Number(overallMedian);
      seasonalFactor = Math.min(1.25, Math.max(0.8, Math.round(raw * 100) / 100));
    }

    const applySeasonal = (value: bigint): bigint => {
      if (seasonalFactor === null || seasonalFactor === 1) return value;
      return (value * BigInt(Math.round(seasonalFactor * 100))) / 100n;
    };

    /** Blend median and recent months, then season-adjust. */
    const suggestVariable = (
      median: bigint | null,
      latest3: bigint | null,
      recurringOverlap: bigint,
    ): bigint => {
      const base =
        median !== null && latest3 !== null
          ? (median + latest3) / 2n
          : median ?? latest3 ?? 0n;
      const withoutRecurring = base - recurringOverlap;
      const floored = withoutRecurring > 0n ? withoutRecurring : 0n;
      return applySeasonal(floored);
    };

    const essentialVariableSuggested = suggestVariable(
      essentialMedian,
      essentialLatest3,
      // Essential fixed + irregular recurring is inside the essential history.
      essentialRecurringMonthly,
    );
    const flexibleSuggested = suggestVariable(
      flexibleMedian,
      flexibleLatest3,
      nonEssentialRecurringMonthly,
    );

    // ---- Goals, sinking funds, savings -------------------------------------
    const goalRows = await db
      .select()
      .from(goals)
      .where(and(eq(goals.householdId, householdId), eq(goals.status, "ACTIVE")));
    const goalsSuggested = goalRows.reduce(
      (sum, g) => sum + (g.monthlyContributionMinor ?? 0n),
      0n,
    );

    const fundRows = await db
      .select()
      .from(sinkingFunds)
      .where(eq(sinkingFunds.householdId, householdId));
    const sinkingMonthly = fundRows.reduce(
      (sum, f) => sum + (f.monthlyContributionMinor ?? 0n),
      0n,
    );

    const savingsTarget = await this.intelligence.savingsTarget(userId, householdId);
    const savingsSuggested = BigInt(savingsTarget.totalAllocatedMinor);

    const irregularSuggested = irregularRecurringTotal + sinkingMonthly;

    // ---- Actuals for the target month --------------------------------------
    const fixedSignatures = new Set(
      fixedStreams.map((s) => s.signature).filter((s): s is string => s !== null),
    );
    const irregularSignatures = new Set(
      irregularStreams.map((s) => s.signature).filter((s): s is string => s !== null),
    );

    const actuals: Record<SmartBudgetGroupKey, bigint> = {
      essential_fixed: 0n,
      essential_variable: 0n,
      irregular: 0n,
      flexible: 0n,
      goals: 0n,
      savings: 0n,
    };

    if (isCurrentMonth || isPastMonth) {
      const txRows = await db
        .select({
          amountMinor: sourceTransactions.amountMinor,
          signature: sourceTransactions.signature,
          categoryId: sourceTransactions.categoryId,
        })
        .from(sourceTransactions)
        .where(
          and(
            eq(sourceTransactions.householdId, householdId),
            eq(sourceTransactions.isExcluded, false),
            eq(sourceTransactions.isInternalTransfer, false),
            gte(sourceTransactions.bookingDate, monthStart),
            lte(sourceTransactions.bookingDate, isCurrentMonth ? asOf : monthEnd),
            sql`${sourceTransactions.amountMinor} < 0`,
          ),
        );
      for (const tx of txRows) {
        const magnitude = -tx.amountMinor;
        if (tx.signature && fixedSignatures.has(tx.signature)) {
          actuals.essential_fixed += magnitude;
          continue;
        }
        if (tx.signature && irregularSignatures.has(tx.signature)) {
          actuals.irregular += magnitude;
          continue;
        }
        const necessity = tx.categoryId
          ? necessityByCategory.get(tx.categoryId) ?? "UNKNOWN"
          : "UNKNOWN";
        if (necessity === "ESSENTIAL" || necessity === "UNKNOWN") {
          actuals.essential_variable += magnitude;
        } else {
          actuals.flexible += magnitude;
        }
      }

      const [goalContrib] = await db
        .select({
          total: sql<string>`coalesce(sum(${goalContributions.amountMinor}), 0)::text`,
        })
        .from(goalContributions)
        .where(
          and(
            eq(goalContributions.householdId, householdId),
            gte(goalContributions.contributedOn, monthStart),
            lte(goalContributions.contributedOn, monthEnd),
          ),
        );
      actuals.goals = BigInt(goalContrib?.total ?? "0");

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
            lte(financialEvents.occurredOn, isCurrentMonth ? asOf : monthEnd),
          ),
        );
      const netSaved = BigInt(monthTotals?.income ?? "0") - BigInt(monthTotals?.expense ?? "0");
      actuals.savings = netSaved > 0n ? netSaved : 0n;
    }

    // ---- Adopted plan -------------------------------------------------------
    const [adoptedRow] = await db
      .select()
      .from(smartBudgets)
      .where(
        and(eq(smartBudgets.householdId, householdId), eq(smartBudgets.month, month)),
      )
      .limit(1);
    const plannedByKey = new Map<string, bigint>(
      (adoptedRow?.lines ?? []).map((line) => [line.key, BigInt(line.plannedMinor)]),
    );

    // ---- Pending expectations for the rest of the month (fixed/irregular) --
    const pendingByGroup = { fixed: 0n, irregular: 0n };
    if (isCurrentMonth) {
      const pending = await db
        .select({
          amount: expectedTransactions.expectedAmountMinor,
          recurringItemId: expectedTransactions.recurringItemId,
          direction: expectedTransactions.direction,
        })
        .from(expectedTransactions)
        .where(
          and(
            eq(expectedTransactions.householdId, householdId),
            eq(expectedTransactions.status, "PENDING"),
            lte(expectedTransactions.expectedFrom, monthEnd),
            gte(expectedTransactions.expectedTo, asOf),
          ),
        );
      const irregularIds = new Set(irregularStreams.map((s) => s.id));
      const fixedIds = new Set(fixedStreams.map((s) => s.id));
      for (const p of pending) {
        if (p.direction === "INFLOW") continue;
        if (irregularIds.has(p.recurringItemId)) {
          pendingByGroup.irregular += abs(p.amount);
        } else if (fixedIds.has(p.recurringItemId)) {
          pendingByGroup.fixed += abs(p.amount);
        }
      }
    }

    // ---- Forecast per group -------------------------------------------------
    const daysInMonth = Number(monthEnd.slice(8, 10));
    const daysElapsed = isCurrentMonth
      ? Number(asOf.slice(8, 10))
      : isPastMonth
        ? daysInMonth
        : 0;
    const daysRemaining = daysInMonth - daysElapsed;

    const forecastFor = (
      key: SmartBudgetGroupKey,
      suggested: bigint,
      planned: bigint | null,
    ): bigint => {
      if (isPastMonth) return actuals[key];
      if (!isCurrentMonth) return planned ?? suggested;
      const budgetLevel = planned ?? suggested;
      if (key === "essential_fixed") {
        const projected = actuals[key] + pendingByGroup.fixed;
        return projected > budgetLevel ? projected : budgetLevel;
      }
      if (key === "irregular") {
        return actuals[key] + pendingByGroup.irregular;
      }
      if (key === "goals" || key === "savings") {
        return budgetLevel;
      }
      // Variable groups: actual so far + remaining share of the budget pace.
      const remainingPace =
        (budgetLevel * BigInt(daysRemaining)) / BigInt(daysInMonth);
      return actuals[key] + remainingPace;
    };

    const basisNotes = (parts: string[]): string[] => parts.filter((p) => p !== "");

    const monthsObserved = window.filter(
      (m) =>
        m.essentialMinor + m.semiDiscretionaryMinor + m.discretionaryMinor > 0n,
    ).length;

    const buildGroup = (
      key: SmartBudgetGroupKey,
      suggested: bigint,
      basis: {
        median12: bigint | null;
        latest3: bigint | null;
        seasonal: number | null;
        notes: string[];
      },
      contributors: SmartBudgetContributor[],
    ): SmartBudgetGroup => {
      const planned = plannedByKey.get(key) ?? null;
      return {
        key,
        name: GROUP_META[key].name,
        description: GROUP_META[key].description,
        suggestedMinor: suggested.toString(),
        plannedMinor: planned?.toString() ?? null,
        actualMinor: actuals[key].toString(),
        forecastMinor: forecastFor(key, suggested, planned).toString(),
        basis: {
          median12Minor: basis.median12?.toString() ?? null,
          latest3Minor: basis.latest3?.toString() ?? null,
          seasonalFactor: basis.seasonal,
          monthsObserved,
          notes: basis.notes,
        },
        contributors,
      };
    };

    const groups: SmartBudgetGroup[] = [
      buildGroup(
        "essential_fixed",
        fixedTotal,
        {
          median12: null,
          latest3: null,
          seasonal: null,
          notes: basisNotes([
            `Summan av ${fixedStreams.length} återkommande åtaganden, normaliserade till månadsbelopp.`,
          ]),
        },
        fixedStreams
          .sort((a, b) => (a.monthlyMinor > b.monthlyMinor ? -1 : 1))
          .map((s) => ({
            kind: "recurring" as const,
            name: s.name,
            monthlyMinor: s.monthlyMinor.toString(),
            href: "/subscriptions",
          })),
      ),
      buildGroup(
        "essential_variable",
        essentialVariableSuggested,
        {
          median12: essentialMedian,
          latest3: essentialLatest3,
          seasonal: seasonalFactor,
          notes: basisNotes([
            essentialMedian !== null
              ? `Median för nödvändiga kostnader: ${formatKr(essentialMedian)}/mån över ${monthsObserved} månader.`
              : "",
            essentialRecurringMonthly > 0n
              ? `Fasta åtaganden på ${formatKr(essentialRecurringMonthly)}/mån är borträknade — de budgeteras i sin egen grupp.`
              : "",
            seasonalFactor !== null && seasonalFactor !== 1
              ? `Säsongsjustering för månaden: ×${seasonalFactor.toFixed(2)}.`
              : "",
          ]),
        },
        [],
      ),
      buildGroup(
        "irregular",
        irregularSuggested,
        {
          median12: null,
          latest3: null,
          seasonal: null,
          notes: basisNotes([
            irregularRecurringTotal > 0n
              ? `Års-/kvartalsräkningar utslagna per månad: ${formatKr(irregularRecurringTotal)}.`
              : "",
            sinkingMonthly > 0n
              ? `Planerade buffertavsättningar: ${formatKr(sinkingMonthly)}/mån.`
              : "",
          ]),
        },
        [
          ...irregularStreams
            .sort((a, b) => (a.monthlyMinor > b.monthlyMinor ? -1 : 1))
            .map((s) => ({
              kind: "recurring" as const,
              name: s.name,
              monthlyMinor: s.monthlyMinor.toString(),
              href: "/subscriptions",
            })),
          ...fundRows
            .filter((f) => (f.monthlyContributionMinor ?? 0n) > 0n)
            .map((f) => ({
              kind: "sinking_fund" as const,
              name: f.name,
              monthlyMinor: (f.monthlyContributionMinor ?? 0n).toString(),
              href: "/goals",
            })),
        ],
      ),
      buildGroup(
        "flexible",
        flexibleSuggested,
        {
          median12: flexibleMedian,
          latest3: flexibleLatest3,
          seasonal: seasonalFactor,
          notes: basisNotes([
            flexibleMedian !== null
              ? `Median för valfri konsumtion: ${formatKr(flexibleMedian)}/mån.`
              : "",
            nonEssentialRecurringMonthly > 0n
              ? `Abonnemang på ${formatKr(nonEssentialRecurringMonthly)}/mån ligger i Fasta åtaganden och räknas inte här.`
              : "",
          ]),
        },
        [],
      ),
      buildGroup(
        "goals",
        goalsSuggested,
        {
          median12: null,
          latest3: null,
          seasonal: null,
          notes: basisNotes([
            goalRows.length > 0
              ? `${goalRows.length} aktiva mål med planerade månadsbidrag.`
              : "Inga aktiva mål med månadsbidrag.",
          ]),
        },
        goalRows
          .filter((g) => (g.monthlyContributionMinor ?? 0n) > 0n)
          .map((g) => ({
            kind: "goal" as const,
            name: g.name,
            monthlyMinor: (g.monthlyContributionMinor ?? 0n).toString(),
            href: "/goals",
          })),
      ),
      buildGroup(
        "savings",
        savingsSuggested,
        {
          median12: null,
          latest3: null,
          seasonal: null,
          notes: basisNotes([
            "Från sparmodellens vattenfall (reserv, oregelbundna kostnader, mål, policyer).",
            ...savingsTarget.notes.slice(0, 2),
          ]),
        },
        savingsTarget.allocations.map((a) => ({
          kind: "policy" as const,
          name: a.label,
          monthlyMinor: a.amountMinor,
          href: "/liquidity",
        })),
      ),
    ];

    // ---- Flex number: what remains after commitments ------------------------
    const committedSuggested =
      fixedTotal +
      essentialVariableSuggested +
      irregularSuggested +
      goalsSuggested +
      savingsSuggested;
    const flexSuggested = expectedIncome - committedSuggested;

    const plannedFlex = plannedByKey.get("flexible") ?? null;
    const flexRemaining =
      isCurrentMonth && (plannedFlex !== null || flexibleSuggested > 0n)
        ? (plannedFlex ?? flexibleSuggested) - actuals.flexible
        : null;

    return {
      asOf,
      currency,
      month,
      monthsOfHistory: input.provenance.monthsOfHistory,
      expectedIncomeMinor: expectedIncome.toString(),
      groups,
      flex: {
        suggestedMinor: flexSuggested.toString(),
        plannedMinor: plannedFlex?.toString() ?? null,
        remainingMinor: flexRemaining?.toString() ?? null,
        explanation: [
          `Förväntad månadsinkomst ${formatKr(expectedIncome)} (median av kompletta månader).`,
          `Minus fasta åtaganden, nödvändigt & rörligt, oregelbundet, mål och sparande: ${formatKr(committedSuggested)}.`,
          "Detta är utrymme, inte kontosaldo — pengarna kan redan vara reserverade på kontot.",
        ],
      },
      adopted: adoptedRow != null,
      adoptedAt: adoptedRow?.updatedAt?.toISOString() ?? null,
    };
  }

  async adopt(
    userId: string,
    input: AdoptSmartBudgetInput,
  ): Promise<SmartBudgetResponse> {
    await this.access.requireCanWrite(userId, input.householdId);
    const db = getDb();
    const lines = input.lines.map((line) => ({
      key: line.key,
      plannedMinor: line.plannedMinor,
    }));
    await db
      .insert(smartBudgets)
      .values({
        householdId: input.householdId,
        month: input.month,
        lines,
      })
      .onConflictDoUpdate({
        target: [smartBudgets.householdId, smartBudgets.month],
        set: { lines, updatedAt: new Date() },
      });
    return this.get(userId, input.householdId, input.month);
  }
}
