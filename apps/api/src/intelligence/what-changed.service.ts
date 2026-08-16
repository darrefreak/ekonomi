import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type {
  WhatChangedDriver,
  WhatChangedMode,
  WhatChangedOneOff,
  WhatChangedResponse,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { categories, merchants, sourceTransactions } from "../db/schema-economic";
import { recurringItems } from "../db/schema-planning";
import { HouseholdAccessService } from "../households/household-access.service";
import { resolveHouseholdAsOf } from "../common/as-of";

/**
 * "Vad har förändrats?" — spending decomposition between two explicit windows.
 *
 * The two windows can be different lengths (30 days vs 12 months), so every
 * compared figure is normalised per month before the subtraction; the raw
 * window totals are also returned so the reader can see both. One-off
 * purchases — large single expenses that do not belong to any detected
 * recurring stream — are isolated in their own section but stay inside the
 * totals, so the decomposition always sums to what the ledger says.
 */

type Window = { label: string; from: string; to: string; months: number };

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function monthShift(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const index = year! * 12 + (m! - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function lastDayOfMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, m!, 0)).toISOString().slice(0, 10);
}

const MONTH_NAMES = [
  "januari",
  "februari",
  "mars",
  "april",
  "maj",
  "juni",
  "juli",
  "augusti",
  "september",
  "oktober",
  "november",
  "december",
];

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m! - 1]} ${year}`;
}

/** value normalised to a per-month amount given a window length in months. */
function perMonth(value: bigint, months: number): bigint {
  if (months <= 0) return value;
  const scaled = Math.round(months * 1000);
  return (value * 1000n) / BigInt(scaled);
}

function resolveWindows(mode: WhatChangedMode, asOf: string): {
  current: Window;
  reference: Window;
} {
  const currentMonth = asOf.slice(0, 7);
  const lastComplete = monthShift(currentMonth, -1);
  switch (mode) {
    case "vs_baseline": {
      return {
        current: {
          label: "Senaste 30 dagarna",
          from: addDays(asOf, -29),
          to: asOf,
          months: 30 / 30.44,
        },
        reference: {
          label: "Normal nivå (föregående 12 månader)",
          from: addDays(asOf, -395),
          to: addDays(asOf, -30),
          months: 366 / 30.44,
        },
      };
    }
    case "vs_previous_month": {
      const before = monthShift(lastComplete, -1);
      return {
        current: {
          label: monthLabel(lastComplete),
          from: `${lastComplete}-01`,
          to: lastDayOfMonth(lastComplete),
          months: 1,
        },
        reference: {
          label: monthLabel(before),
          from: `${before}-01`,
          to: lastDayOfMonth(before),
          months: 1,
        },
      };
    }
    case "vs_same_month_last_year": {
      const lastYear = monthShift(lastComplete, -12);
      return {
        current: {
          label: monthLabel(lastComplete),
          from: `${lastComplete}-01`,
          to: lastDayOfMonth(lastComplete),
          months: 1,
        },
        reference: {
          label: monthLabel(lastYear),
          from: `${lastYear}-01`,
          to: lastDayOfMonth(lastYear),
          months: 1,
        },
      };
    }
    case "3m_vs_12m": {
      const threeStart = monthShift(lastComplete, -2);
      const twelveEnd = monthShift(threeStart, -1);
      const twelveStart = monthShift(twelveEnd, -11);
      return {
        current: {
          label: `Senaste 3 månaderna (${monthLabel(threeStart)}–${monthLabel(lastComplete)})`,
          from: `${threeStart}-01`,
          to: lastDayOfMonth(lastComplete),
          months: 3,
        },
        reference: {
          label: `Föregående 12 månader`,
          from: `${twelveStart}-01`,
          to: lastDayOfMonth(twelveEnd),
          months: 12,
        },
      };
    }
    case "ytd_vs_previous_year": {
      const year = Number(asOf.slice(0, 4));
      const dayOfYear =
        (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${year}-01-01T00:00:00Z`)) /
          86_400_000 +
        1;
      const months = dayOfYear / 30.44;
      const lastYearSameDay = `${year - 1}${asOf.slice(4)}`;
      return {
        current: {
          label: `I år (1 jan – ${asOf})`,
          from: `${year}-01-01`,
          to: asOf,
          months,
        },
        reference: {
          label: `Förra året (1 jan – ${lastYearSameDay})`,
          from: `${year - 1}-01-01`,
          to: lastYearSameDay,
          months,
        },
      };
    }
  }
}

type PeriodAggregate = {
  incomeMinor: bigint;
  expenseMinor: bigint;
  byCategory: Map<string, { id: string | null; name: string; amount: bigint }>;
  byMerchant: Map<string, { id: string; name: string; amount: bigint }>;
};

@Injectable()
export class WhatChangedService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  async get(
    userId: string,
    householdId: string,
    mode: WhatChangedMode,
  ): Promise<WhatChangedResponse> {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = household.baseCurrency || "SEK";
    const asOf = await resolveHouseholdAsOf(householdId);
    const { current, reference } = resolveWindows(mode, asOf);

    const [currentAgg, referenceAgg] = await Promise.all([
      this.loadWindow(householdId, current.from, current.to),
      this.loadWindow(householdId, reference.from, reference.to),
    ]);

    const currentExpensePm = perMonth(currentAgg.expenseMinor, current.months);
    const referenceExpensePm = perMonth(referenceAgg.expenseMinor, reference.months);
    const currentIncomePm = perMonth(currentAgg.incomeMinor, current.months);
    const referenceIncomePm = perMonth(referenceAgg.incomeMinor, reference.months);

    const expenseChange = currentExpensePm - referenceExpensePm;
    const incomeChange = currentIncomePm - referenceIncomePm;

    const drivers = (
      kind: "category" | "merchant",
      currentMap: Map<string, { id: string | null; name: string; amount: bigint }>,
      referenceMap: Map<string, { id: string | null; name: string; amount: bigint }>,
    ): WhatChangedDriver[] => {
      const keys = new Set([...currentMap.keys(), ...referenceMap.keys()]);
      const rows: WhatChangedDriver[] = [];
      for (const key of keys) {
        const cur = currentMap.get(key);
        const ref = referenceMap.get(key);
        const curPm = perMonth(cur?.amount ?? 0n, current.months);
        const refPm = perMonth(ref?.amount ?? 0n, reference.months);
        const change = curPm - refPm;
        if (change === 0n) continue;
        const id = cur?.id ?? ref?.id ?? null;
        const name = cur?.name ?? ref?.name ?? key;
        const href =
          kind === "category" && id
            ? `/reports?measure=spending&dimension=merchant&categoryId=${id}&contextLabel=${encodeURIComponent(name)}&from=${current.from}&to=${current.to}`
            : kind === "merchant" && id
              ? `/transactions?merchantId=${id}&from=${current.from}&to=${current.to}`
              : null;
        rows.push({
          kind,
          key,
          name,
          currentMinor: curPm.toString(),
          referenceMinor: refPm.toString(),
          changeMinor: change.toString(),
          percentChange:
            refPm > 0n
              ? Math.round((Number(change) / Number(refPm)) * 1000) / 10
              : null,
          href,
        });
      }
      rows.sort((a, b) => {
        const aAbs = BigInt(a.changeMinor) < 0n ? -BigInt(a.changeMinor) : BigInt(a.changeMinor);
        const bAbs = BigInt(b.changeMinor) < 0n ? -BigInt(b.changeMinor) : BigInt(b.changeMinor);
        return aAbs > bAbs ? -1 : aAbs < bAbs ? 1 : 0;
      });
      return rows.slice(0, 10);
    };

    const oneOffs = await this.loadOneOffs(
      householdId,
      current.from,
      current.to,
      referenceAgg,
      reference.months,
    );

    return {
      asOf,
      currency,
      mode,
      current: {
        ...current,
        incomeMinor: currentAgg.incomeMinor.toString(),
        expenseMinor: currentAgg.expenseMinor.toString(),
      },
      reference: {
        ...reference,
        incomeMinor: referenceAgg.incomeMinor.toString(),
        expenseMinor: referenceAgg.expenseMinor.toString(),
      },
      expenseChangeMinor: expenseChange.toString(),
      incomeChangeMinor: incomeChange.toString(),
      savingsChangeMinor: (incomeChange - expenseChange).toString(),
      expenseChangePercent:
        referenceExpensePm > 0n
          ? Math.round((Number(expenseChange) / Number(referenceExpensePm)) * 1000) / 10
          : null,
      categoryDrivers: drivers("category", currentAgg.byCategory, referenceAgg.byCategory),
      merchantDrivers: drivers("merchant", currentAgg.byMerchant, referenceAgg.byMerchant),
      oneOffs,
      explanation: [
        `Jämförelsen är ${current.label.toLowerCase()} mot ${reference.label.toLowerCase()}.`,
        "Olika långa perioder normaliseras per månad innan de jämförs.",
        "Engångsköp ingår i totalsummorna men listas separat så att du kan bedöma dem för sig.",
        "Interna överföringar och exkluderade transaktioner räknas inte.",
      ],
    };
  }

  private async loadWindow(
    householdId: string,
    from: string,
    to: string,
  ): Promise<PeriodAggregate> {
    const db = getDb();
    const rows = await db
      .select({
        amountMinor: sql<string>`sum(${sourceTransactions.amountMinor})::text`,
        isInflow: sql<boolean>`${sourceTransactions.amountMinor} >= 0`,
        categoryId: categories.id,
        categoryKey: categories.key,
        categoryName: categories.name,
        merchantId: merchants.id,
        merchantName: merchants.canonicalName,
      })
      .from(sourceTransactions)
      .leftJoin(categories, eq(sourceTransactions.categoryId, categories.id))
      .leftJoin(merchants, eq(sourceTransactions.merchantId, merchants.id))
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          eq(sourceTransactions.isExcluded, false),
          eq(sourceTransactions.isInternalTransfer, false),
          gte(sourceTransactions.bookingDate, from),
          lte(sourceTransactions.bookingDate, to),
        ),
      )
      .groupBy(
        sql`${sourceTransactions.amountMinor} >= 0`,
        categories.id,
        categories.key,
        categories.name,
        merchants.id,
        merchants.canonicalName,
      );

    const agg: PeriodAggregate = {
      incomeMinor: 0n,
      expenseMinor: 0n,
      byCategory: new Map(),
      byMerchant: new Map(),
    };
    for (const row of rows) {
      const amount = BigInt(row.amountMinor);
      if (row.isInflow) {
        agg.incomeMinor += amount;
        continue;
      }
      const magnitude = -amount;
      agg.expenseMinor += magnitude;
      const categoryKey = row.categoryKey ?? "uncategorised";
      const cat = agg.byCategory.get(categoryKey) ?? {
        id: row.categoryId,
        name: row.categoryName ?? "Okategoriserat",
        amount: 0n,
      };
      cat.amount += magnitude;
      agg.byCategory.set(categoryKey, cat);
      if (row.merchantId && row.merchantName) {
        const mer = agg.byMerchant.get(row.merchantId) ?? {
          id: row.merchantId,
          name: row.merchantName,
          amount: 0n,
        };
        mer.amount += magnitude;
        agg.byMerchant.set(row.merchantId, mer);
      }
    }
    return agg;
  }

  /**
   * Large single expenses in the current window that no recurring stream
   * explains. Threshold: at least 1 000 kr and at least twice the reference
   * window's per-month expense divided by 30 (a rough "large for this
   * household" bar) — deterministic and stated in the response.
   */
  private async loadOneOffs(
    householdId: string,
    from: string,
    to: string,
    referenceAgg: PeriodAggregate,
    referenceMonths: number,
  ) {
    const db = getDb();
    const refDaily = perMonth(referenceAgg.expenseMinor, referenceMonths) / 30n;
    const floor = 100_000n; // 1 000 kr
    const threshold = refDaily * 2n > floor ? refDaily * 2n : floor;

    const recurringSignatures = await db
      .select({ signature: recurringItems.signature })
      .from(recurringItems)
      .where(
        and(
          eq(recurringItems.householdId, householdId),
          inArray(recurringItems.status, ["DETECTED", "CONFIRMED"]),
        ),
      );
    const signatureSet = new Set(
      recurringSignatures
        .map((row) => row.signature)
        .filter((s): s is string => s !== null),
    );

    const rows = await db
      .select({
        id: sourceTransactions.id,
        description: sourceTransactions.description,
        amountMinor: sourceTransactions.amountMinor,
        bookingDate: sourceTransactions.bookingDate,
        signature: sourceTransactions.signature,
        categoryName: categories.name,
        merchantName: merchants.canonicalName,
      })
      .from(sourceTransactions)
      .leftJoin(categories, eq(sourceTransactions.categoryId, categories.id))
      .leftJoin(merchants, eq(sourceTransactions.merchantId, merchants.id))
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          eq(sourceTransactions.isExcluded, false),
          eq(sourceTransactions.isInternalTransfer, false),
          gte(sourceTransactions.bookingDate, from),
          lte(sourceTransactions.bookingDate, to),
          sql`${sourceTransactions.amountMinor} <= ${-threshold}`,
        ),
      )
      .orderBy(sql`${sourceTransactions.amountMinor} asc`)
      .limit(20);

    const items: WhatChangedOneOff[] = rows
      .filter((row) => !row.signature || !signatureSet.has(row.signature))
      .map((row) => ({
        transactionId: row.id,
        description: row.description ?? "Transaktion",
        amountMinor: row.amountMinor.toString(),
        date: row.bookingDate,
        categoryName: row.categoryName,
        merchantName: row.merchantName,
      }));
    const total = items.reduce((sum, item) => sum + -BigInt(item.amountMinor), 0n);

    return {
      includedInTotals: true as const,
      thresholdMinor: threshold.toString(),
      items,
      totalMinor: total.toString(),
    };
  }
}
