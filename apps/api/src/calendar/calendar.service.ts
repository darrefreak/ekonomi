import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, gte, lte, sql } from "drizzle-orm";
import type { CurrencyCode } from "@ffos/domain";
import type {
  CalendarDay,
  CalendarEvent,
  CalendarResponse,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { financialEvents, merchants, sourceTransactions } from "../db/schema-economic";
import {
  contracts,
  expectedTransactions,
  goals,
  recurringItems,
  subscriptions,
} from "../db/schema-planning";
import { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { resolveHouseholdAsOf } from "../common/as-of";

/**
 * The Financial Calendar — every known or expected money movement in the next
 * 7–90 days, merged from the sources that already exist, with a deterministic
 * projected-cash walk after each day.
 *
 * The merge rule is the same one the dashboard's upcoming list uses (§26 of
 * the intelligence plan): a scheduled obligation outranks a prediction of the
 * same obligation. A subscription with a real next-charge date appears once;
 * the expected-recurring row for the same name is dropped. The salary estimate
 * only appears when no detected income stream covers the window — a guess
 * never sits beside the real thing.
 *
 * Nothing here writes. The projection is arithmetic on top of the current
 * available cash; it never touches ledger state.
 */

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function nextDayOfMonth(asOf: string, day: number): string {
  const d = new Date(`${asOf}T00:00:00.000Z`);
  if (d.getUTCDate() >= day) d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(day);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class CalendarService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(HouseholdMetricsService)
    private readonly metrics: HouseholdMetricsService,
  ) {}

  async get(
    userId: string,
    householdId: string,
    horizonDays = 90,
  ): Promise<CalendarResponse> {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = await resolveHouseholdAsOf(householdId);
    const horizon = addDays(asOf, horizonDays);
    const db = getDb();

    const events: CalendarEvent[] = [];
    /** Lower-cased titles already covered by a scheduled source. */
    const knownTitles = new Set<string>();

    // 1) Future-dated actual transactions — the strongest evidence there is.
    const futureTx = await db
      .select({
        id: sourceTransactions.id,
        bookingDate: sourceTransactions.bookingDate,
        description: sourceTransactions.description,
        amountMinor: sourceTransactions.amountMinor,
        merchantName: merchants.canonicalName,
      })
      .from(sourceTransactions)
      .leftJoin(merchants, eq(sourceTransactions.merchantId, merchants.id))
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          eq(sourceTransactions.isExcluded, false),
          gt(sourceTransactions.bookingDate, asOf),
          lte(sourceTransactions.bookingDate, horizon),
        ),
      );
    for (const tx of futureTx) {
      const title = tx.merchantName ?? tx.description ?? "Transaktion";
      events.push({
        id: `tx-${tx.id}`,
        source: "FUTURE_TRANSACTION",
        confidence: "KNOWN",
        title,
        direction: tx.amountMinor >= 0n ? "INFLOW" : "OUTFLOW",
        amountMinor: tx.amountMinor.toString(),
        lowMinor: null,
        highMinor: null,
        date: tx.bookingDate,
        windowFrom: null,
        windowTo: null,
        recurringId: null,
        transactionId: tx.id,
        href: `/transactions/${tx.id}`,
      });
      knownTitles.add(title.trim().toLowerCase());
    }

    // 2) Scheduled subscriptions with a concrete next charge date.
    const subs = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.householdId, householdId),
          eq(subscriptions.status, "ACTIVE"),
          gte(subscriptions.nextChargeOn, asOf),
          lte(subscriptions.nextChargeOn, horizon),
        ),
      );
    for (const s of subs) {
      if (!s.nextChargeOn) continue;
      if (knownTitles.has(s.name.trim().toLowerCase())) continue;
      events.push({
        id: `sub-${s.id}`,
        source: "SUBSCRIPTION_CHARGE",
        confidence: "KNOWN",
        title: s.name,
        direction: "OUTFLOW",
        amountMinor: (-s.amountMinor).toString(),
        lowMinor: null,
        highMinor: null,
        date: s.nextChargeOn,
        windowFrom: null,
        windowTo: null,
        recurringId: null,
        transactionId: null,
        href: "/subscriptions",
      });
      knownTitles.add(s.name.trim().toLowerCase());
    }

    // 3) Contract renewals / cancellation deadlines inside the window.
    const cons = await db
      .select()
      .from(contracts)
      .where(eq(contracts.householdId, householdId));
    for (const c of cons) {
      const date = c.renewalDate ?? c.cancellationDeadline ?? c.endDate;
      if (!date || date <= asOf || date > horizon) continue;
      const title = c.name || c.provider;
      if (knownTitles.has(title.trim().toLowerCase())) continue;
      const amountMinor =
        c.monthlyCostMinor ??
        (c.annualCostMinor != null ? c.annualCostMinor / 12n : 0n);
      events.push({
        id: `contract-${c.id}`,
        source: "CONTRACT_RENEWAL",
        confidence: "KNOWN",
        title,
        direction: "OUTFLOW",
        amountMinor: (-amountMinor).toString(),
        lowMinor: null,
        highMinor: null,
        date,
        windowFrom: null,
        windowTo: null,
        recurringId: null,
        transactionId: null,
        href: "/contracts",
      });
      knownTitles.add(title.trim().toLowerCase());
    }

    // 4) Expected transactions from detected recurring streams — with band.
    const expectations = await db
      .select({
        expectation: expectedTransactions,
        name: recurringItems.name,
        recurringType: recurringItems.recurringType,
        recurringId: recurringItems.id,
      })
      .from(expectedTransactions)
      .innerJoin(
        recurringItems,
        eq(expectedTransactions.recurringItemId, recurringItems.id),
      )
      .where(
        and(
          eq(expectedTransactions.householdId, householdId),
          eq(expectedTransactions.status, "PENDING"),
          gte(expectedTransactions.expectedTo, asOf),
          lte(expectedTransactions.expectedFrom, horizon),
        ),
      );
    let expectedIncomeListed = false;
    for (const { expectation, name, recurringType, recurringId } of expectations) {
      if (knownTitles.has(name.trim().toLowerCase())) continue;
      const isIncome = expectation.direction === "INFLOW";
      if (isIncome) expectedIncomeListed = true;
      const sign = isIncome ? 1n : -1n;
      // Place the event on the earliest day of the window (cash-conservative
      // for outflows), clamped inside the horizon.
      const date =
        expectation.expectedFrom > asOf ? expectation.expectedFrom : addDays(asOf, 1);
      events.push({
        id: `expected-${expectation.id}`,
        source: "EXPECTED_RECURRING",
        confidence: "EXPECTED",
        title:
          recurringType === "SALARY" && isIncome ? `${name} (lön)` : name,
        direction: isIncome ? "INFLOW" : "OUTFLOW",
        amountMinor: (sign * expectation.expectedAmountMinor).toString(),
        lowMinor: (sign * expectation.expectedLowMinor).toString(),
        highMinor: (sign * expectation.expectedHighMinor).toString(),
        date,
        windowFrom: expectation.expectedFrom,
        windowTo: expectation.expectedTo,
        recurringId,
        transactionId: null,
        href: "/subscriptions",
      });
      knownTitles.add(name.trim().toLowerCase());
    }

    // 5) Deterministic salary estimate — only when nothing real covers income.
    if (!expectedIncomeListed) {
      const salaryDate = nextDayOfMonth(asOf, 25);
      if (salaryDate <= horizon) {
        const estimate = await this.estimateMonthlyIncome(householdId, asOf);
        if (estimate > 0n) {
          events.push({
            id: "salary-estimate",
            source: "SALARY_ESTIMATE",
            confidence: "ESTIMATED",
            title: "Löner (estimerat)",
            direction: "INFLOW",
            amountMinor: estimate.toString(),
            lowMinor: null,
            highMinor: null,
            date: salaryDate,
            windowFrom: null,
            windowTo: null,
            recurringId: null,
            transactionId: null,
            href: null,
          });
        }
      }
    }

    // 6) Goal target dates — planned, remaining amount only.
    const goalRows = await db
      .select()
      .from(goals)
      .where(
        and(
          eq(goals.householdId, householdId),
          eq(goals.status, "ACTIVE"),
          gte(goals.targetDate, asOf),
          lte(goals.targetDate, horizon),
        ),
      );
    for (const g of goalRows) {
      if (!g.targetDate) continue;
      const remaining = g.targetMinor - g.currentMinor;
      if (remaining <= 0n) continue;
      events.push({
        id: `goal-${g.id}`,
        source: "GOAL_TARGET",
        confidence: "EXPECTED",
        title: `${g.name} (mål)`,
        direction: "OUTFLOW",
        amountMinor: (-remaining).toString(),
        lowMinor: null,
        highMinor: null,
        date: g.targetDate,
        windowFrom: null,
        windowTo: null,
        recurringId: null,
        transactionId: null,
        href: "/goals",
      });
    }

    // Group per day, chronological, and walk the projected balance.
    const snap = await this.metrics.getFinancialSnapshot(householdId, currency, asOf);
    const startingCash = BigInt(snap.position.availableCash.amountMinor);

    const byDate = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const list = byDate.get(event.date) ?? [];
      list.push(event);
      byDate.set(event.date, list);
    }
    const dates = [...byDate.keys()].sort();

    const days: CalendarDay[] = [];
    let running = startingCash;
    let lowest: { date: string; projectedCashMinor: string } | null = null;
    for (const date of dates) {
      const dayEvents = byDate
        .get(date)!
        .sort((a, b) =>
          BigInt(a.amountMinor) < BigInt(b.amountMinor) ? -1 : 1,
        );
      const net = dayEvents.reduce(
        (sum, event) => sum + BigInt(event.amountMinor),
        0n,
      );
      running += net;
      if (lowest === null || running < BigInt(lowest.projectedCashMinor)) {
        lowest = { date, projectedCashMinor: running.toString() };
      }
      days.push({
        date,
        events: dayEvents,
        netMinor: net.toString(),
        projectedCashMinor: running.toString(),
      });
    }

    const summarise = (windowDays: number) => {
      const end = addDays(asOf, windowDays);
      let inflow = 0n;
      let outflow = 0n;
      let endCash = startingCash;
      let count = 0;
      for (const day of days) {
        if (day.date > end) break;
        endCash = BigInt(day.projectedCashMinor);
        for (const event of day.events) {
          count += 1;
          const amount = BigInt(event.amountMinor);
          if (amount >= 0n) inflow += amount;
          else outflow += -amount;
        }
      }
      return {
        days: windowDays,
        inflowMinor: inflow.toString(),
        outflowMinor: outflow.toString(),
        netMinor: (inflow - outflow).toString(),
        endProjectedCashMinor: endCash.toString(),
        eventCount: count,
      };
    };

    return {
      asOf,
      currency,
      horizonDays,
      startingCashMinor: startingCash.toString(),
      days,
      summaries: {
        "7": summarise(7),
        "30": summarise(30),
        "60": summarise(60),
        "90": summarise(90),
      },
      lowestPoint: lowest,
      method: [
        "Startpunkten är hushållets tillgängliga kassa just nu.",
        "Kända händelser: framtida bokförda transaktioner, schemalagda abonnemang och avtal.",
        "Förväntade händelser: upptäckta återkommande betalningar med beloppsintervall, placerade på fönstrets första dag.",
        "Estimerade händelser: lönegissning den 25:e — visas bara när ingen riktig inkomstström täcker perioden.",
        "Samma åtagande räknas aldrig två gånger: ett schemalagt belopp ersätter förväntningen med samma namn.",
      ],
    };
  }

  /** Previous complete month's income, the same seed the dashboard estimate uses. */
  private async estimateMonthlyIncome(
    householdId: string,
    asOf: string,
  ): Promise<bigint> {
    const db = getDb();
    const currentMonth = asOf.slice(0, 7);
    const prev = new Date(`${currentMonth}-01T00:00:00Z`);
    prev.setUTCMonth(prev.getUTCMonth() - 1);
    const prevMonth = prev.toISOString().slice(0, 7);
    const rows = await db
      .select({
        month: sql<string>`to_char(${financialEvents.occurredOn}, 'YYYY-MM')`,
        income: sql<string>`coalesce(sum(${financialEvents.incomeAmountMinor}), 0)::text`,
      })
      .from(financialEvents)
      .where(
        and(
          eq(financialEvents.householdId, householdId),
          eq(financialEvents.status, "ACTIVE"),
          sql`to_char(${financialEvents.occurredOn}, 'YYYY-MM') in (${currentMonth}, ${prevMonth})`,
        ),
      )
      .groupBy(sql`to_char(${financialEvents.occurredOn}, 'YYYY-MM')`);
    const byMonth = new Map(rows.map((row) => [row.month, BigInt(row.income)]));
    const current = byMonth.get(currentMonth) ?? 0n;
    return current > 0n ? current : byMonth.get(prevMonth) ?? 0n;
  }
}
