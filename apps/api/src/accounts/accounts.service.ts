import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, ne } from "drizzle-orm";
import { moneyToJson } from "@ffos/domain";
import { getDb } from "../db/client";
import { accounts } from "../db/schema-economic";
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
      items: rows.map((row) => ({
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
      })),
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
      creditLimit: row.creditLimitMinor
        ? moneyToJson({
            amountMinor: row.creditLimitMinor,
            currency: row.currency as "SEK",
          })
        : null,
    };
  }
}
