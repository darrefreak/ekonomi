import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { moneyToJson } from "@ffos/domain";
import { getDb } from "../db/client";
import {
  accounts,
  categories,
  merchants,
  sourceTransactions,
} from "../db/schema-economic";
import { HouseholdAccessService } from "../households/household-access.service";

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  async list(userId: string, householdId: string, limit = 50) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
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
      .where(eq(sourceTransactions.householdId, householdId))
      .orderBy(desc(sourceTransactions.bookingDate), desc(sourceTransactions.createdAt))
      .limit(Math.min(limit, 200));

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
    };
  }
}
