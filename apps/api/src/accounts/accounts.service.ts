import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { money, moneyToJson } from "@ffos/domain";
import { getDb } from "../db/client";
import {
  accountBalanceSnapshots,
  accounts,
  categories,
  merchants,
  sourceTransactions,
} from "../db/schema-economic";
import { HouseholdAccessService } from "../households/household-access.service";

@Injectable()
export class AccountsService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  async list(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const rows = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          ne(accounts.isSystem, true),
          ne(accounts.accountType, "EXPENSE"),
          ne(accounts.accountType, "INCOME"),
        ),
      )
      .orderBy(asc(accounts.name));

    return {
      items: rows.map((row) => this.toListItem(row)),
    };
  }

  async get(userId: string, householdId: string, accountId: string) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const [row] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.householdId, householdId), eq(accounts.id, accountId)))
      .limit(1);
    if (!row) return null;

    const recent = await db
      .select({
        id: sourceTransactions.id,
        bookingDate: sourceTransactions.bookingDate,
        description: sourceTransactions.description,
        amountMinor: sourceTransactions.amountMinor,
        currency: sourceTransactions.currency,
        merchantName: merchants.canonicalName,
        categoryName: categories.name,
      })
      .from(sourceTransactions)
      .leftJoin(merchants, eq(sourceTransactions.merchantId, merchants.id))
      .leftJoin(categories, eq(sourceTransactions.categoryId, categories.id))
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          eq(sourceTransactions.accountId, accountId),
        ),
      )
      .orderBy(desc(sourceTransactions.bookingDate))
      .limit(20);

    const history = await db
      .select()
      .from(accountBalanceSnapshots)
      .where(
        and(
          eq(accountBalanceSnapshots.householdId, householdId),
          eq(accountBalanceSnapshots.accountId, accountId),
        ),
      )
      .orderBy(asc(accountBalanceSnapshots.asOf));

    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const monthStart = `${asOf.slice(0, 7)}-01`;
    const [period] = await db
      .select({
        income: sql<string>`coalesce(sum(case when ${sourceTransactions.amountMinor} > 0 then ${sourceTransactions.amountMinor} else 0 end), 0)`,
        expenses: sql<string>`coalesce(sum(case when ${sourceTransactions.amountMinor} < 0 then -${sourceTransactions.amountMinor} else 0 end), 0)`,
      })
      .from(sourceTransactions)
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          eq(sourceTransactions.accountId, accountId),
          gte(sourceTransactions.bookingDate, monthStart),
          lte(sourceTransactions.bookingDate, asOf),
        ),
      );

    return {
      ...this.toListItem(row),
      creditLimit: row.creditLimitMinor
        ? moneyToJson({
            amountMinor: row.creditLimitMinor,
            currency: row.currency as "SEK",
          })
        : null,
      externalReference: row.externalReference,
      recentTransactions: recent.map((tx) => ({
        id: tx.id,
        bookingDate: String(tx.bookingDate),
        description: tx.description,
        amount: moneyToJson({
          amountMinor: tx.amountMinor,
          currency: tx.currency as "SEK",
        }),
        merchantName: tx.merchantName,
        categoryName: tx.categoryName,
      })),
      balanceHistory: history.map((h) => ({
        asOf: h.asOf.toISOString(),
        balance: moneyToJson({
          amountMinor: h.reportedBalanceMinor ?? 0n,
          currency: row.currency as "SEK",
        }),
        source: h.source,
      })),
      period: {
        income: moneyToJson(
          money(BigInt(period?.income ?? "0"), row.currency as "SEK"),
        ),
        expenses: moneyToJson(
          money(BigInt(period?.expenses ?? "0"), row.currency as "SEK"),
        ),
      },
    };
  }

  private toListItem(row: typeof accounts.$inferSelect) {
    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      accountType: row.accountType,
      currency: row.currency,
      isShared: row.isShared,
      currentBalance: moneyToJson({
        amountMinor: row.currentBalanceMinor,
        currency: row.currency as "SEK",
      }),
      connectionStatus: row.connectionStatus,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      freshnessLabel: row.lastSyncedAt ? "synkad" : null,
    };
  }
}
