import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { moneyToJson } from "@ffos/domain";
import type { ResolveReviewInput } from "@ffos/schemas";
import { getDb } from "../db/client";
import {
  accounts,
  categories,
  merchants,
  sourceTransactions,
} from "../db/schema-economic";
import { documents } from "../db/schema-intake";
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

    const docRows = await db
      .select({
        id: documents.id,
        title: documents.title,
        status: documents.status,
        receivedAt: documents.receivedAt,
        amountMinor: documents.amountMinor,
        currency: documents.currency,
      })
      .from(documents)
      .where(
        and(
          eq(documents.householdId, householdId),
          inArray(documents.status, ["REVIEW", "ACTION_REQUIRED"]),
        ),
      )
      .orderBy(desc(documents.receivedAt))
      .limit(10);

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

    const documentFields = docRows.map((row) => ({
      id: `doc-${row.id}`,
      kind: "document_field" as const,
      title: row.title,
      detail: `Dokumentstatus ${row.status} — granska eller arkivera.`,
      amount: row.amountMinor
        ? moneyToJson({
            amountMinor: row.amountMinor,
            currency: (row.currency as "SEK") || "SEK",
          })
        : null,
      bookingDate: row.receivedAt.toISOString().slice(0, 10),
      entityId: row.id,
    }));

    const items = [
      ...unknownTransactions.slice(0, 5),
      ...possibleInternalTransfers.slice(0, 3),
      ...unknownMerchants.slice(0, 5),
      ...documentFields.slice(0, 5),
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

  async resolve(userId: string, input: ResolveReviewInput) {
    await this.access.requireCanWrite(userId, input.householdId);
    const db = getDb();

    if (input.kind === "document_field") {
      if (input.action !== "archive_document" && input.action !== "dismiss") {
        throw new BadRequestException(
          "document_field supports archive_document or dismiss",
        );
      }
      const [doc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, input.entityId),
            eq(documents.householdId, input.householdId),
          ),
        )
        .limit(1);
      if (!doc) throw new NotFoundException("Document not found");
      await db
        .update(documents)
        .set({
          status: "ARCHIVED",
          notes: input.notes ?? doc.notes,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, doc.id));
      return this.list(userId, input.householdId);
    }

    const [tx] = await db
      .select()
      .from(sourceTransactions)
      .where(
        and(
          eq(sourceTransactions.id, input.entityId),
          eq(sourceTransactions.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!tx) throw new NotFoundException("Transaction not found");

    if (input.action === "set_category") {
      if (!input.categoryId) {
        throw new BadRequestException("categoryId required");
      }
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
      await db
        .update(sourceTransactions)
        .set({ categoryId: input.categoryId, updatedAt: new Date() })
        .where(eq(sourceTransactions.id, tx.id));
    } else if (input.action === "mark_internal_transfer") {
      await db
        .update(sourceTransactions)
        .set({ isInternalTransfer: true, updatedAt: new Date() })
        .where(eq(sourceTransactions.id, tx.id));
    } else if (input.action === "set_merchant") {
      if (!input.merchantId) {
        throw new BadRequestException("merchantId required");
      }
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
      await db
        .update(sourceTransactions)
        .set({ merchantId: input.merchantId, updatedAt: new Date() })
        .where(eq(sourceTransactions.id, tx.id));
    } else if (input.action === "dismiss") {
      await db
        .update(sourceTransactions)
        .set({
          isExcluded: true,
          notes: input.notes ?? tx.notes ?? "Dismissed from review",
          updatedAt: new Date(),
        })
        .where(eq(sourceTransactions.id, tx.id));
    } else {
      throw new BadRequestException(`Unsupported action ${input.action}`);
    }

    return this.list(userId, input.householdId);
  }
}
