import {
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, gte, lte, ne, sql, type SQL } from "drizzle-orm";
import { moneyToJson } from "@ffos/domain";
import type { UpdateTransactionInput } from "@ffos/schemas";
import { getDb } from "../db/client";
import {
  accounts,
  categories,
  financialEvents,
  merchants,
  sourceTransactionLinks,
  sourceTransactions,
} from "../db/schema-economic";
import { vehicles } from "../db/schema-vehicles";
import { HouseholdAccessService } from "../households/household-access.service";

export type TransactionListFilters = {
  limit?: number;
  q?: string;
  accountId?: string;
  from?: string;
  to?: string;
  includeExcluded?: boolean;
  vehicleId?: string;
};

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  async listCategories(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const rows = await db
      .select({
        id: categories.id,
        key: categories.key,
        name: categories.name,
        kind: categories.kind,
        parentId: categories.parentId,
      })
      .from(categories)
      .where(eq(categories.householdId, householdId))
      .orderBy(asc(categories.name));
    return { items: rows };
  }

  async list(userId: string, householdId: string, filters: TransactionListFilters = {}) {
    const viewer = await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const conditions: SQL[] = [eq(sourceTransactions.householdId, householdId)];

    if (!filters.includeExcluded) {
      conditions.push(eq(sourceTransactions.isExcluded, false));
    }
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
    if (filters.vehicleId) {
      conditions.push(eq(financialEvents.vehicleId, filters.vehicleId));
    }

    const rows = await db
      .select({
        id: sourceTransactions.id,
        accountId: sourceTransactions.accountId,
        accountName: accounts.name,
        accountIsShared: accounts.isShared,
        accountOwnerMemberId: accounts.ownerMemberId,
        bookingDate: sourceTransactions.bookingDate,
        description: sourceTransactions.description,
        amountMinor: sourceTransactions.amountMinor,
        currency: sourceTransactions.currency,
        categoryId: sourceTransactions.categoryId,
        categoryName: categories.name,
        merchantId: sourceTransactions.merchantId,
        merchantName: merchants.canonicalName,
        isInternalTransfer: sourceTransactions.isInternalTransfer,
        transferGroupId: sourceTransactions.transferGroupId,
        isExcluded: sourceTransactions.isExcluded,
        notes: sourceTransactions.notes,
        tags: sourceTransactions.tags,
        status: sourceTransactions.status,
        vehicleId: financialEvents.vehicleId,
        financialEventId: financialEvents.id,
      })
      .from(sourceTransactions)
      .innerJoin(accounts, eq(sourceTransactions.accountId, accounts.id))
      .leftJoin(categories, eq(sourceTransactions.categoryId, categories.id))
      .leftJoin(merchants, eq(sourceTransactions.merchantId, merchants.id))
      .leftJoin(
        sourceTransactionLinks,
        and(
          eq(sourceTransactionLinks.sourceTransactionId, sourceTransactions.id),
          eq(sourceTransactionLinks.role, "primary"),
        ),
      )
      .leftJoin(
        financialEvents,
        eq(financialEvents.id, sourceTransactionLinks.financialEventId),
      )
      .where(and(...conditions))
      .orderBy(desc(sourceTransactions.bookingDate), desc(sourceTransactions.createdAt))
      .limit(Math.min(filters.limit ?? 50, 200));

    const items = [];
    for (const row of rows) {
      const visibility = await this.access.accountVisibility(viewer, {
        isShared: row.accountIsShared,
        ownerMemberId: row.accountOwnerMemberId,
      });
      const projected = this.access.projectTransactionItem(
        this.toListItem(row),
        visibility,
      );
      if (projected) items.push(projected);
    }

    return {
      items,
      filters: {
        q: filters.q ?? null,
        accountId: filters.accountId ?? null,
        from: filters.from ?? null,
        to: filters.to ?? null,
        includeExcluded: Boolean(filters.includeExcluded),
      },
    };
  }

  async get(userId: string, householdId: string, transactionId: string) {
    const viewer = await this.access.requireMembership(userId, householdId);
    const row = await this.loadOne(householdId, transactionId);
    if (!row) throw new NotFoundException("Transaction not found");

    const visibility = await this.access.accountVisibility(viewer, {
      isShared: row.accountIsShared,
      ownerMemberId: row.accountOwnerMemberId,
    });
    const projected = this.access.projectTransactionItem(
      this.toListItem(row),
      visibility,
    );
    if (!projected) throw new NotFoundException("Transaction not found");

    const relatedTransfers =
      visibility === "full" && row.transferGroupId
        ? await this.loadRelated(householdId, row.transferGroupId, row.id)
        : [];

    return {
      ...projected,
      relatedTransfers,
    };
  }

  async update(
    userId: string,
    transactionId: string,
    input: UpdateTransactionInput,
  ) {
    await this.access.requireCanWrite(userId, input.householdId);
    const existing = await this.loadOne(input.householdId, transactionId);
    if (!existing) throw new NotFoundException("Transaction not found");

    const db = getDb();
    if (input.categoryId) {
      const [cat] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, input.categoryId),
            eq(categories.householdId, input.householdId),
          ),
        )
        .limit(1);
      if (!cat) throw new NotFoundException("Category not found");
    }

    if (input.vehicleId) {
      const [v] = await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(
          and(
            eq(vehicles.id, input.vehicleId),
            eq(vehicles.householdId, input.householdId),
          ),
        )
        .limit(1);
      if (!v) throw new NotFoundException("Vehicle not found");
    }

    if (input.merchantId) {
      const [m] = await db
        .select({ id: merchants.id })
        .from(merchants)
        .where(
          and(
            eq(merchants.id, input.merchantId),
            eq(merchants.householdId, input.householdId),
          ),
        )
        .limit(1);
      if (!m) throw new NotFoundException("Merchant not found");
    }

    const patch: Partial<typeof sourceTransactions.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
    if (input.merchantId !== undefined) patch.merchantId = input.merchantId;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.isExcluded !== undefined) patch.isExcluded = input.isExcluded;
    if (input.isInternalTransfer !== undefined) {
      patch.isInternalTransfer = input.isInternalTransfer;
    }
    if (input.description !== undefined) patch.description = input.description;

    await db.transaction(async (tx) => {
      await tx
        .update(sourceTransactions)
        .set(patch)
        .where(eq(sourceTransactions.id, transactionId));

      if (input.vehicleId !== undefined && existing.financialEventId) {
        await tx
          .update(financialEvents)
          .set({ vehicleId: input.vehicleId })
          .where(eq(financialEvents.id, existing.financialEventId));
      }
    });

    return this.get(userId, input.householdId, transactionId);
  }

  private async loadOne(householdId: string, transactionId: string) {
    const db = getDb();
    const [row] = await db
      .select({
        id: sourceTransactions.id,
        accountId: sourceTransactions.accountId,
        accountName: accounts.name,
        accountIsShared: accounts.isShared,
        accountOwnerMemberId: accounts.ownerMemberId,
        bookingDate: sourceTransactions.bookingDate,
        description: sourceTransactions.description,
        amountMinor: sourceTransactions.amountMinor,
        currency: sourceTransactions.currency,
        categoryId: sourceTransactions.categoryId,
        categoryName: categories.name,
        merchantId: sourceTransactions.merchantId,
        merchantName: merchants.canonicalName,
        isInternalTransfer: sourceTransactions.isInternalTransfer,
        transferGroupId: sourceTransactions.transferGroupId,
        isExcluded: sourceTransactions.isExcluded,
        notes: sourceTransactions.notes,
        tags: sourceTransactions.tags,
        status: sourceTransactions.status,
        vehicleId: financialEvents.vehicleId,
        financialEventId: financialEvents.id,
      })
      .from(sourceTransactions)
      .innerJoin(accounts, eq(sourceTransactions.accountId, accounts.id))
      .leftJoin(categories, eq(sourceTransactions.categoryId, categories.id))
      .leftJoin(merchants, eq(sourceTransactions.merchantId, merchants.id))
      .leftJoin(
        sourceTransactionLinks,
        and(
          eq(sourceTransactionLinks.sourceTransactionId, sourceTransactions.id),
          eq(sourceTransactionLinks.role, "primary"),
        ),
      )
      .leftJoin(
        financialEvents,
        eq(financialEvents.id, sourceTransactionLinks.financialEventId),
      )
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          eq(sourceTransactions.id, transactionId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  private async loadRelated(
    householdId: string,
    transferGroupId: string,
    excludeId: string,
  ) {
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
        linkRole: sourceTransactionLinks.role,
      })
      .from(sourceTransactions)
      .innerJoin(accounts, eq(sourceTransactions.accountId, accounts.id))
      .leftJoin(
        sourceTransactionLinks,
        and(
          eq(sourceTransactionLinks.sourceTransactionId, sourceTransactions.id),
          eq(sourceTransactionLinks.householdId, householdId),
        ),
      )
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          eq(sourceTransactions.transferGroupId, transferGroupId),
          ne(sourceTransactions.id, excludeId),
        ),
      )
      .orderBy(asc(sourceTransactions.bookingDate));

    return rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      accountName: row.accountName,
      bookingDate: String(row.bookingDate),
      description: row.description,
      amount: moneyToJson({
        amountMinor: row.amountMinor,
        currency: row.currency as "SEK",
      }),
      role: row.linkRole ?? "related",
    }));
  }

  private toListItem(row: {
    id: string;
    accountId: string;
    accountName: string;
    bookingDate: string | Date;
    description: string | null;
    amountMinor: bigint;
    currency: string;
    categoryId: string | null;
    categoryName: string | null;
    merchantId: string | null;
    merchantName: string | null;
    isInternalTransfer: boolean;
    transferGroupId: string | null;
    isExcluded: boolean;
    notes: string | null;
    tags: string[] | null;
    status: string;
    vehicleId?: string | null;
    financialEventId?: string | null;
  }) {
    return {
      id: row.id,
      accountId: row.accountId,
      accountName: row.accountName,
      bookingDate: String(row.bookingDate),
      description: row.description,
      amount: moneyToJson({
        amountMinor: row.amountMinor,
        currency: row.currency as "SEK",
      }),
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      merchantId: row.merchantId,
      merchantName: row.merchantName,
      isInternalTransfer: row.isInternalTransfer,
      transferGroupId: row.transferGroupId,
      isExcluded: row.isExcluded,
      notes: row.notes,
      tags: row.tags ?? [],
      status: row.status,
      vehicleId: row.vehicleId ?? null,
      financialEventId: row.financialEventId ?? null,
    };
  }
}
