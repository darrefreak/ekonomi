import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import type {
  ReportDimension,
  ReportExploreQuery,
  ReportExploreResponse,
  ReportExploreRow,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { accounts, categories, merchants, sourceTransactions } from "../db/schema-economic";
import { HouseholdAccessService } from "../households/household-access.service";
import { resolveHouseholdAsOf } from "../common/as-of";

/**
 * Reports V2 — one aggregation, drillable until the transaction list.
 *
 * A report is measure × dimension × window × filters. Drilling down is just
 * another request with one more filter: category → merchants within the
 * category → the transactions themselves. The endpoint never invents a number;
 * everything is a SUM over the same rows the transaction list shows.
 */

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

@Injectable()
export class ReportExploreService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  async explore(
    userId: string,
    query: ReportExploreQuery,
  ): Promise<ReportExploreResponse> {
    const { household } = await this.access.requireMembership(
      userId,
      query.householdId,
    );
    const currency = household.baseCurrency || "SEK";
    const asOf = await resolveHouseholdAsOf(query.householdId);
    const to = query.to ?? asOf;
    const from = query.from ?? addDays(to, -364);
    const db = getDb();

    const conditions: SQL[] = [
      eq(sourceTransactions.householdId, query.householdId),
      eq(sourceTransactions.isExcluded, false),
      eq(sourceTransactions.isInternalTransfer, false),
      gte(sourceTransactions.bookingDate, from),
      lte(sourceTransactions.bookingDate, to),
    ];
    if (query.measure === "spending") {
      conditions.push(sql`${sourceTransactions.amountMinor} < 0`);
    } else if (query.measure === "income") {
      conditions.push(sql`${sourceTransactions.amountMinor} >= 0`);
    }
    if (query.categoryId) {
      conditions.push(eq(sourceTransactions.categoryId, query.categoryId));
    }
    if (query.merchantId) {
      conditions.push(eq(sourceTransactions.merchantId, query.merchantId));
    }
    if (query.accountId) {
      conditions.push(eq(sourceTransactions.accountId, query.accountId));
    }

    // For spending, magnitudes are positive so the report reads naturally;
    // cashflow keeps the sign because in/out is the whole point.
    const amountExpr =
      query.measure === "spending"
        ? sql<string>`sum(-${sourceTransactions.amountMinor})::text`
        : sql<string>`sum(${sourceTransactions.amountMinor})::text`;

    const groupColumns = this.dimensionColumns(query.dimension);
    const rows = await db
      .select({
        key: groupColumns.key,
        id: groupColumns.id,
        name: groupColumns.name,
        amountMinor: amountExpr,
        count: sql<number>`count(*)::int`,
      })
      .from(sourceTransactions)
      .leftJoin(categories, eq(sourceTransactions.categoryId, categories.id))
      .leftJoin(merchants, eq(sourceTransactions.merchantId, merchants.id))
      .leftJoin(accounts, eq(sourceTransactions.accountId, accounts.id))
      .where(and(...conditions))
      .groupBy(groupColumns.key, groupColumns.id, groupColumns.name);

    const series = await db
      .select({
        month: sql<string>`to_char(${sourceTransactions.bookingDate}, 'YYYY-MM')`,
        amountMinor: amountExpr,
      })
      .from(sourceTransactions)
      .where(and(...conditions))
      .groupBy(sql`to_char(${sourceTransactions.bookingDate}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${sourceTransactions.bookingDate}, 'YYYY-MM')`);

    let totalMinor = 0n;
    let transactionCount = 0;
    for (const row of rows) {
      totalMinor += BigInt(row.amountMinor);
      transactionCount += row.count;
    }

    const filterParams = (extra: Record<string, string | undefined>) => {
      const params = new URLSearchParams();
      params.set("from", from);
      params.set("to", to);
      if (query.categoryId) params.set("categoryId", query.categoryId);
      if (query.merchantId) params.set("merchantId", query.merchantId);
      if (query.accountId) params.set("accountId", query.accountId);
      for (const [key, value] of Object.entries(extra)) {
        if (value) params.set(key, value);
      }
      return params;
    };

    const result: ReportExploreRow[] = rows
      .map((row) => {
        const amount = BigInt(row.amountMinor);
        let drillHref: string | null = null;
        if (query.dimension === "category" && row.id) {
          const params = filterParams({ categoryId: row.id });
          params.set("measure", query.measure);
          params.set("dimension", "merchant");
          drillHref = `/reports?${params.toString()}`;
        } else if (query.dimension === "merchant" && row.id) {
          const params = filterParams({ merchantId: row.id });
          drillHref = `/transactions?${params.toString()}`;
        } else if (query.dimension === "account" && row.id) {
          const params = filterParams({ accountId: row.id });
          drillHref = `/transactions?${params.toString()}`;
        } else if (query.dimension === "month") {
          const params = filterParams({});
          params.set("from", `${row.key}-01`);
          params.set(
            "to",
            new Date(
              Date.UTC(Number(row.key.slice(0, 4)), Number(row.key.slice(5, 7)), 0),
            )
              .toISOString()
              .slice(0, 10),
          );
          drillHref = `/transactions?${params.toString()}`;
        }
        return {
          key: row.key ?? "unknown",
          id: row.id,
          name: row.name ?? "Okänt",
          amountMinor: amount.toString(),
          transactionCount: row.count,
          share:
            totalMinor !== 0n
              ? Math.round((Number(amount) / Number(totalMinor)) * 1000) / 1000
              : 0,
          drillHref,
        };
      })
      .sort((a, b) => {
        const aAbs = BigInt(a.amountMinor) < 0n ? -BigInt(a.amountMinor) : BigInt(a.amountMinor);
        const bAbs = BigInt(b.amountMinor) < 0n ? -BigInt(b.amountMinor) : BigInt(b.amountMinor);
        return aAbs > bAbs ? -1 : aAbs < bAbs ? 1 : 0;
      });

    return {
      asOf,
      currency,
      measure: query.measure,
      dimension: query.dimension,
      from,
      to,
      totalMinor: totalMinor.toString(),
      transactionCount,
      rows: result,
      series: series.map((point) => ({
        month: point.month,
        amountMinor: BigInt(point.amountMinor).toString(),
      })),
    };
  }

  private dimensionColumns(dimension: ReportDimension): {
    key: SQL<string>;
    id: SQL<string | null>;
    name: SQL<string | null>;
  } {
    switch (dimension) {
      case "category":
        return {
          key: sql<string>`coalesce(${categories.key}, 'uncategorised')`,
          id: sql<string | null>`${categories.id}`,
          name: sql<string | null>`coalesce(${categories.name}, 'Okategoriserat')`,
        };
      case "merchant":
        return {
          key: sql<string>`coalesce(${merchants.id}::text, 'unknown')`,
          id: sql<string | null>`${merchants.id}`,
          name: sql<string | null>`coalesce(${merchants.canonicalName}, 'Okänd mottagare')`,
        };
      case "account":
        return {
          key: sql<string>`${accounts.id}::text`,
          id: sql<string | null>`${accounts.id}`,
          name: sql<string | null>`${accounts.name}`,
        };
      case "month":
        return {
          key: sql<string>`to_char(${sourceTransactions.bookingDate}, 'YYYY-MM')`,
          id: sql<string | null>`null`,
          name: sql<string | null>`to_char(${sourceTransactions.bookingDate}, 'YYYY-MM')`,
        };
    }
  }
}
