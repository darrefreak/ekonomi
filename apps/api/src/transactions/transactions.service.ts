import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { moneyToJson } from "@ffos/domain";
import { getDb } from "../db/client";
import {
  accounts,
  categories,
  merchants,
  sourceTransactions,
} from "../db/schema-economic";
import { HouseholdAccessService } from "../households/household-access.service";

export type TransactionListFilters = {
  limit?: number;
  q?: string;
  accountId?: string;
  from?: string;
  to?: string;
};

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  async list(userId: string, householdId: string, filters: TransactionListFilters = {}) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const conditions: SQL[] = [eq(sourceTransactions.householdId, householdId)];

    if (filters.accountId) {
      conditions.push(eq(sourceTransactions.accountId, filters.accountId));
    }
    if (filters.from) {
      conditions.push(gte(sourceTransactions.bookingDate, filters.from));
    }
    if (filters.to) {
      conditions.push(lte(sourceTransactions.bookingDate, filters.to));
    }
    if (filters.q?.trim()) {
      const q = `%${filters.q.trim()}%`;
      conditions.push(
        sql`(
          ${sourceTransactions.description} ilike ${q}
          or ${merchants.canonicalName} ilike ${q}
          or ${categories.name} ilike ${q}
        )`,
      );
    }

    const rows = await db
      .select({
        id: sourceTransactions.id,
        accountId: sourceTransactions.accountId,
        accountName: accounts.name,
        bookingDate: sourceTransactions.bookingDate,
        description: sourceTransactions.description,
        amountMinor: sourceTransactions.amountMinor,
        currency: sourceTransactions.currency,
        categoryName: categories.name,
        merchantName: merchants.canonicalName,
        isInternalTransfer: sourceTransactions.isInternalTransfer,
        status: sourceTransactions.status,
      })
      .from(sourceTransactions)
      .innerJoin(accounts, eq(sourceTransactions.accountId, accounts.id))
      .leftJoin(categories, eq(sourceTransactions.categoryId, categories.id))
      .leftJoin(merchants, eq(sourceTransactions.merchantId, merchants.id))
      .where(and(...conditions))
      .orderBy(desc(sourceTransactions.bookingDate), desc(sourceTransactions.createdAt))
      .limit(Math.min(filters.limit ?? 50, 200));

    return {
      items: rows.map((row) => ({
        id: row.id,
        accountId: row.accountId,
        accountName: row.accountName,
        bookingDate: String(row.bookingDate),
        description: row.description,
        amount: moneyToJson({
          amountMinor: row.amountMinor,
          currency: row.currency as "SEK",
        }),
        categoryName: row.categoryName,
        merchantName: row.merchantName,
        isInternalTransfer: row.isInternalTransfer,
        status: row.status,
      })),
      filters: {
        q: filters.q ?? null,
        accountId: filters.accountId ?? null,
        from: filters.from ?? null,
        to: filters.to ?? null,
      },
    };
  }
}
