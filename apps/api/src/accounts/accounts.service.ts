import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { money, moneyToJson } from "@ffos/domain";
import type { CreateAccountInput, UpdateAccountInput } from "@ffos/schemas";
import { getDb } from "../db/client";
import {
  accountBalanceSnapshots,
  accounts,
  categories,
  merchants,
  sourceTransactions,
} from "../db/schema-economic";
import { HouseholdAccessService } from "../households/household-access.service";

const USER_ACCOUNT_TYPES = new Set([
  "CHECKING",
  "SAVINGS",
  "CREDIT_CARD",
  "CASH",
  "INVESTMENT",
  "MORTGAGE",
  "LOAN",
  "TAX_ACCOUNT",
  "PENSION",
  "CRYPTO",
  "OTHER",
  "ASSET",
]);

@Injectable()
export class AccountsService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  async list(
    userId: string,
    householdId: string,
    opts?: { includeArchived?: boolean },
  ) {
    const viewer = await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const conditions = [
      eq(accounts.householdId, householdId),
      ne(accounts.isSystem, true),
      ne(accounts.accountType, "EXPENSE"),
      ne(accounts.accountType, "INCOME"),
    ];
    if (!opts?.includeArchived) {
      conditions.push(isNull(accounts.archivedAt));
    }
    const rows = await db
      .select()
      .from(accounts)
      .where(and(...conditions))
      .orderBy(asc(accounts.name));

    const items = [];
    for (const row of rows) {
      const visibility = await this.access.accountVisibility(viewer, row);
      const projected = this.access.projectAccountListItem(
        this.toListItem(row),
        visibility,
      );
      if (projected) items.push(projected);
    }
    return { items };
  }

  async create(userId: string, input: CreateAccountInput) {
    await this.access.requireCanWrite(userId, input.householdId);
    if (!USER_ACCOUNT_TYPES.has(input.accountType)) {
      throw new BadRequestException("Invalid account type");
    }
    const db = getDb();
    const opening = BigInt(input.openingBalanceMinor ?? "0");
    const creditLimit =
      input.creditLimitMinor != null && input.creditLimitMinor !== ""
        ? BigInt(input.creditLimitMinor)
        : null;
    const [row] = await db
      .insert(accounts)
      .values({
        householdId: input.householdId,
        name: input.name.trim(),
        accountType: input.accountType,
        currency: input.currency ?? "SEK",
        provider: input.provider ?? null,
        isShared: input.isShared ?? true,
        creditLimitMinor: creditLimit,
        externalReference: input.externalReference ?? null,
        currentBalanceMinor: opening,
        connectionStatus: "DISCONNECTED",
        isSystem: false,
        lastSyncedAt: null,
      })
      .returning();

    if (opening !== 0n) {
      await db.insert(accountBalanceSnapshots).values({
        householdId: input.householdId,
        accountId: row.id,
        reportedBalanceMinor: opening,
        availableBalanceMinor: opening,
        ledgerCalculatedBalanceMinor: opening,
        reconciledBalanceMinor: opening,
        asOf: new Date(),
        source: "manual_opening",
        confidence: "1",
        userVerified: true,
        isEstimated: false,
      });
    }

    return this.toListItem(row);
  }

  async update(userId: string, accountId: string, input: UpdateAccountInput) {
    await this.access.requireCanWrite(userId, input.householdId);
    const db = getDb();
    const [existing] = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, input.householdId),
          eq(accounts.id, accountId),
          ne(accounts.isSystem, true),
        ),
      )
      .limit(1);
    if (!existing || existing.archivedAt) {
      throw new NotFoundException("Account not found");
    }

    const patch: Partial<typeof accounts.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.provider !== undefined) patch.provider = input.provider;
    if (input.isShared !== undefined) patch.isShared = input.isShared;
    if (input.externalReference !== undefined) {
      patch.externalReference = input.externalReference;
    }
    if (input.connectionStatus !== undefined) {
      patch.connectionStatus = input.connectionStatus;
    }
    if (input.creditLimitMinor !== undefined) {
      patch.creditLimitMinor =
        input.creditLimitMinor === null || input.creditLimitMinor === ""
          ? null
          : BigInt(input.creditLimitMinor);
    }

    const [row] = await db
      .update(accounts)
      .set(patch)
      .where(eq(accounts.id, accountId))
      .returning();
    return this.toListItem(row);
  }

  async archive(userId: string, householdId: string, accountId: string) {
    await this.access.requireCanWrite(userId, householdId);
    const db = getDb();
    const [existing] = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          eq(accounts.id, accountId),
          ne(accounts.isSystem, true),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException("Account not found");
    if (existing.archivedAt) return this.toListItem(existing);

    const [row] = await db
      .update(accounts)
      .set({
        archivedAt: new Date(),
        connectionStatus: "DISCONNECTED",
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, accountId))
      .returning();
    return this.toListItem(row);
  }

  async get(userId: string, householdId: string, accountId: string) {
    const viewer = await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const [row] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.householdId, householdId), eq(accounts.id, accountId)))
      .limit(1);
    if (!row || row.isSystem) return null;

    const visibility = await this.access.accountVisibility(viewer, row);
    if (visibility === "hidden") return null;

    const listItem = this.access.projectAccountListItem(
      this.toListItem(row),
      visibility,
    );
    if (!listItem) return null;

    const recent =
      visibility === "full"
        ? await db
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
            .leftJoin(
              categories,
              eq(sourceTransactions.categoryId, categories.id),
            )
            .where(
              and(
                eq(sourceTransactions.householdId, householdId),
                eq(sourceTransactions.accountId, accountId),
                eq(sourceTransactions.isExcluded, false),
              ),
            )
            .orderBy(desc(sourceTransactions.bookingDate))
            .limit(20)
        : [];

    const history =
      visibility === "full" || visibility === "balance"
        ? await db
            .select()
            .from(accountBalanceSnapshots)
            .where(
              and(
                eq(accountBalanceSnapshots.householdId, householdId),
                eq(accountBalanceSnapshots.accountId, accountId),
              ),
            )
            .orderBy(asc(accountBalanceSnapshots.asOf))
        : [];

    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const monthStart = `${asOf.slice(0, 7)}-01`;
    const [period] =
      visibility === "full" || visibility === "balance"
        ? await db
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
                eq(sourceTransactions.isExcluded, false),
              ),
            )
        : [{ income: "0", expenses: "0" }];

    return {
      ...listItem,
      creditLimit:
        visibility === "full" && row.creditLimitMinor
          ? moneyToJson({
              amountMinor: row.creditLimitMinor,
              currency: row.currency as "SEK",
            })
          : null,
      externalReference: visibility === "full" ? row.externalReference : null,
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
      privacyRedacted: visibility !== "full",
      privacyLevel: visibility,
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
      freshnessLabel: row.lastSyncedAt
        ? "synkad"
        : row.connectionStatus === "DISCONNECTED"
          ? "manuell"
          : null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
    };
  }
}
