import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { CreateHouseholdInput } from "@ffos/schemas";
import { getDb } from "../db/client";
import { householdMembers, households } from "../db/schema";
import { accounts, ledgerPostings } from "../db/schema-economic";
import { logger } from "../common/logger";
import {
  assertSupportedHouseholdCurrency,
  isSupportedAggregationCurrency,
} from "../common/currency-policy";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class HouseholdsService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async create(userId: string, input: CreateHouseholdInput, requestId?: string) {
    const db = getDb();
    // The schema already restricts this, but a household is where the currency
    // invariant begins, so it is asserted rather than assumed: seeds, jobs and
    // tests reach this method without passing through the HTTP schema.
    const baseCurrency = input.baseCurrency ?? "SEK";
    assertSupportedHouseholdCurrency(baseCurrency);
    const [household] = await db
      .insert(households)
      .values({
        name: input.name,
        baseCurrency,
      })
      .returning();

    await db.insert(householdMembers).values({
      householdId: household.id,
      userId,
      role: "OWNER",
      personalDataPolicy: "FULL_DETAILS",
    });

    await this.audit.record({
      householdId: household.id,
      actorUserId: userId,
      action: "household.create",
      entity: "household",
      entityId: household.id,
      after: { name: household.name, baseCurrency: household.baseCurrency },
      requestId,
    });

    logger.info("household_created", { householdId: household.id, userId });
    return household;
  }

  async listForUser(userId: string) {
    const db = getDb();
    const rows = await db
      .select({
        id: households.id,
        name: households.name,
        baseCurrency: households.baseCurrency,
        role: householdMembers.role,
      })
      .from(householdMembers)
      .innerJoin(households, eq(householdMembers.householdId, households.id))
      .where(eq(householdMembers.userId, userId));
    return rows.map((row) => ({
      ...row,
      // The client needs to know a household is unusable without inferring it
      // from a failed account creation.
      currencySupported: isSupportedAggregationCurrency(row.baseCurrency),
    }));
  }

  /**
   * Move a household created before the currency guard onto a supported
   * currency.
   *
   * Only safe while the household holds no money. Changing the label on an
   * account that holds 100 EUR would silently turn it into 100 SEK, so a
   * household with financial data is refused and told what to clear first
   * rather than quietly re-denominated.
   */
  async migrateBaseCurrency(
    userId: string,
    householdId: string,
    baseCurrency: string,
    requestId?: string,
  ) {
    assertSupportedHouseholdCurrency(baseCurrency);
    const db = getDb();

    const [membership] = await db
      .select({ role: householdMembers.role, name: households.name, current: households.baseCurrency })
      .from(householdMembers)
      .innerJoin(households, eq(householdMembers.householdId, households.id))
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!membership) throw new NotFoundException("Household not found");
    if (membership.role !== "OWNER") {
      throw new ForbiddenException("Only an owner can change the household currency");
    }
    if (membership.current === baseCurrency) {
      return { householdId, baseCurrency, changed: false };
    }

    const [holdings] = await db
      .select({
        accounts: sql<number>`(select count(*) from ${accounts}
          where ${accounts.householdId} = ${householdId}
            and ${accounts.isSystem} is not true
            and ${accounts.archivedAt} is null)`,
        postings: sql<number>`(select count(*) from ${ledgerPostings}
          where ${ledgerPostings.householdId} = ${householdId})`,
      })
      .from(households)
      .where(eq(households.id, householdId))
      .limit(1);

    const openAccounts = Number(holdings?.accounts ?? 0);
    const postingCount = Number(holdings?.postings ?? 0);
    if (openAccounts > 0 || postingCount > 0) {
      throw new ConflictException({
        code: "CURRENCY_MIGRATION_UNSAFE",
        message:
          `Hushållet räknar i ${membership.current} och innehåller redan ` +
          `${openAccounts} konto(n) och ${postingCount} bokförda poster. ` +
          `Att byta valuta skulle döpa om beloppen utan att räkna om dem. ` +
          `Arkivera kontona och ta bort bokföringen först, eller radera hushållet.`,
        fields: {
          accounts: String(openAccounts),
          postings: String(postingCount),
        },
      });
    }

    await db
      .update(households)
      .set({ baseCurrency, updatedAt: new Date() })
      .where(eq(households.id, householdId));

    // System books are stamped with a currency when they are created; an empty
    // household may already have them from a surface that resolved one.
    await db
      .update(accounts)
      .set({ currency: baseCurrency, updatedAt: new Date() })
      .where(and(eq(accounts.householdId, householdId), eq(accounts.isSystem, true)));

    await this.audit.record({
      householdId,
      actorUserId: userId,
      action: "household.migrate_base_currency",
      entity: "household",
      entityId: householdId,
      before: { baseCurrency: membership.current },
      after: { baseCurrency },
      requestId,
    });

    logger.info("household_base_currency_migrated", {
      householdId,
      from: membership.current,
      to: baseCurrency,
    });
    return { householdId, baseCurrency, changed: true };
  }
}
