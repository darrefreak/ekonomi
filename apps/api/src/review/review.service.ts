import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { moneyToJson } from "@ffos/domain";
import { getDb } from "../db/client";
import { accounts, sourceTransactions } from "../db/schema-economic";
import { HouseholdAccessService } from "../households/household-access.service";

@Injectable()
export class ReviewService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  async list(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();

    const unknownMerchantRows = await db
      .select({
        id: sourceTransactions.id,
        bookingDate: sourceTransactions.bookingDate,
        description: sourceTransactions.description,
        amountMinor: sourceTransactions.amountMinor,
        currency: sourceTransactions.currency,
      })
      .from(sourceTransactions)
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          isNull(sourceTransactions.merchantId),
          eq(sourceTransactions.isInternalTransfer, false),
          sql`${sourceTransactions.amountMinor} < 0`,
        ),
      )
      .orderBy(desc(sourceTransactions.bookingDate))
      .limit(20);

    const possibleTransfers = await db
      .select({
        id: sourceTransactions.id,
        bookingDate: sourceTransactions.bookingDate,
        description: sourceTransactions.description,
        amountMinor: sourceTransactions.amountMinor,
        currency: sourceTransactions.currency,
        accountName: accounts.name,
      })
      .from(sourceTransactions)
      .innerJoin(accounts, eq(sourceTransactions.accountId, accounts.id))
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          eq(sourceTransactions.isInternalTransfer, false),
          or(
            sql`${sourceTransactions.description} ilike '%överföring%'`,
            sql`${sourceTransactions.description} ilike '%transfer%'`,
            sql`${sourceTransactions.description} ilike '%swish%'`,
          ),
        ),
      )
      .orderBy(desc(sourceTransactions.bookingDate))
      .limit(10);

    const unknownCategoryRows = await db
      .select({
        id: sourceTransactions.id,
        bookingDate: sourceTransactions.bookingDate,
        description: sourceTransactions.description,
        amountMinor: sourceTransactions.amountMinor,
        currency: sourceTransactions.currency,
      })
      .from(sourceTransactions)
      .where(
        and(
          eq(sourceTransactions.householdId, householdId),
          isNull(sourceTransactions.categoryId),
          eq(sourceTransactions.isInternalTransfer, false),
        ),
      )
      .orderBy(desc(sourceTransactions.bookingDate))
      .limit(15);

    const unknownMerchants = unknownMerchantRows.map((row) => ({
      id: `merchant-${row.id}`,
      kind: "unknown_merchant" as const,
      title: row.description ?? "Okänd mottagare",
      detail: "Vi kunde inte koppla raden till en känd merchant.",
      amount: moneyToJson({
        amountMinor: row.amountMinor,
        currency: row.currency as "SEK",
      }),
      bookingDate: String(row.bookingDate),
      entityId: row.id,
    }));

    const unknownTransactions = unknownCategoryRows.map((row) => ({
      id: `tx-${row.id}`,
      kind: "unknown_transaction" as const,
      title: row.description ?? "Okänd transaktion",
      detail: "Kategori saknas och behöver granskas.",
      amount: moneyToJson({
        amountMinor: row.amountMinor,
        currency: row.currency as "SEK",
      }),
      bookingDate: String(row.bookingDate),
      entityId: row.id,
    }));

    const possibleInternalTransfers = possibleTransfers.map((row) => ({
      id: `transfer-${row.id}`,
      kind: "possible_internal_transfer" as const,
      title: row.description ?? "Möjlig intern överföring",
      detail: `Vi tror att detta kan vara en intern överföring (${row.accountName}).`,
      amount: moneyToJson({
        amountMinor: row.amountMinor,
        currency: row.currency as "SEK",
      }),
      bookingDate: String(row.bookingDate),
      entityId: row.id,
    }));

    // Document fields reserved for Phase 6 inbox — keep count slot visible.
    const documentFields: typeof unknownMerchants = [];

    const items = [
      ...unknownTransactions.slice(0, 5),
      ...possibleInternalTransfers.slice(0, 3),
      ...unknownMerchants.slice(0, 5),
      ...documentFields,
    ];

    return {
      total: items.length,
      items,
      counts: {
        unknownTransactions: unknownTransactions.length,
        possibleInternalTransfers: possibleInternalTransfers.length,
        unknownMerchants: unknownMerchants.length,
        documentFields: documentFields.length,
      },
    };
  }
}
