import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { and, asc, desc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { money, moneyToJson } from "@ffos/domain";
import type { CreateAccountInput, UpdateAccountInput } from "@ffos/schemas";
import { getDb } from "../db/client";
import { householdMembers } from "../db/schema";
import {
  accountBalanceSnapshots,
  accounts,
  categories,
  merchants,
  sourceTransactions,
} from "../db/schema-economic";
import { HouseholdAccessService } from "../households/household-access.service";
import { LedgerTruthService } from "../ledger/ledger-truth.service";
import { AuditService } from "../audit/audit.service";
import { resolveHouseholdAsOf } from "../common/as-of";
import { openingSnapshotAsOf } from "../common/snapshot-as-of";
import { runIdempotentCommand } from "../common/command-idempotency";
import { assertAggregatableCurrency } from "../metrics/currency-support";

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
    @Inject(AuditService) private readonly audit: AuditService,
    @Optional() private readonly ledger?: LedgerTruthService,
  ) {}

  /** Validates that a member belongs to the household before assigning ownership. */
  private async requireMemberInHousehold(householdId: string, memberId: string) {
    const db = getDb();
    const [member] = await db
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.id, memberId),
          eq(householdMembers.householdId, householdId),
        ),
      )
      .limit(1);
    if (!member) {
      throw new BadRequestException("ownerMemberId does not belong to this household");
    }
  }

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

    // Acceptance: list balances are ledger-aligned (opening + postings), not stale cache.
    const ledgerById = this.ledger
      ? await this.ledger.reconstructHousehold(householdId)
      : null;

    const items = [];
    for (const row of rows) {
      const visibility = await this.access.accountVisibility(viewer, row);
      const ledgerBalance =
        ledgerById?.get(row.id) ?? row.currentBalanceMinor;
      const projected = this.access.projectAccountListItem(
        this.toListItem({ ...row, currentBalanceMinor: ledgerBalance }),
        visibility,
      );
      if (projected) items.push(projected);
    }
    return { items };
  }

  /**
   * Create one account, with its opening position and audit row, as a single
   * atomic and idempotent command.
   *
   * A retry carrying the same `Idempotency-Key` returns the original account
   * instead of booking a second opening balance (RT2-002). A *different* key
   * with the same payload creates a second account on purpose: households
   * legitimately hold two accounts of the same type at the same bank, and the
   * domain declares no uniqueness there.
   */
  async create(
    userId: string,
    input: CreateAccountInput,
    options: { idempotencyKey?: string | null } = {},
  ) {
    const { household } = await this.access.requireCanWrite(
      userId,
      input.householdId,
    );
    if (!USER_ACCOUNT_TYPES.has(input.accountType)) {
      throw new BadRequestException("Invalid account type");
    }
    // An account the household's totals cannot include must not come into
    // existence: V1 has no FX engine, and letting it in used to break every
    // aggregate surface irrecoverably (FPA-001).
    assertAggregatableCurrency(
      input.currency ?? "SEK",
      household.baseCurrency || "SEK",
    );
    if (input.ownerMemberId) {
      await this.requireMemberInHousehold(input.householdId, input.ownerMemberId);
    }
    const opening = BigInt(input.openingBalanceMinor ?? "0");
    const creditLimit =
      input.creditLimitMinor != null && input.creditLimitMinor !== ""
        ? BigInt(input.creditLimitMinor)
        : null;

    const { accountId } = await runIdempotentCommand({
      householdId: input.householdId,
      commandType: "CREATE_ACCOUNT",
      idempotencyKey: options.idempotencyKey,
      request: {
        householdId: input.householdId,
        name: input.name.trim(),
        accountType: input.accountType,
        currency: input.currency ?? "SEK",
        provider: input.provider ?? null,
        ownerMemberId: input.ownerMemberId ?? null,
        isShared: input.isShared ?? true,
        creditLimitMinor: creditLimit?.toString() ?? null,
        externalReference: input.externalReference ?? null,
        openingBalanceMinor: opening.toString(),
      },
      command: async (tx) => {
        const [row] = await tx
          .insert(accounts)
          .values({
            householdId: input.householdId,
            name: input.name.trim(),
            accountType: input.accountType,
            currency: input.currency ?? "SEK",
            provider: input.provider ?? null,
            ownerMemberId: input.ownerMemberId ?? null,
            isShared: input.isShared ?? true,
            creditLimitMinor: creditLimit,
            externalReference: input.externalReference ?? null,
            openingBalanceMinor: opening,
            currentBalanceMinor: opening,
            reportedBalanceMinor: opening,
            connectionStatus: "DISCONNECTED",
            isSystem: false,
            lastSyncedAt: null,
          })
          .returning();

        if (opening !== 0n) {
          await tx.insert(accountBalanceSnapshots).values({
            householdId: input.householdId,
            accountId: row.id,
            reportedBalanceMinor: opening,
            availableBalanceMinor: opening,
            ledgerCalculatedBalanceMinor: opening,
            reconciledBalanceMinor: opening,
            // Midday UTC, the convention every snapshot writer shares, so the
            // (account, as_of, source) identity can actually see duplicates.
            asOf: openingSnapshotAsOf(new Date()),
            source: "manual_opening",
            confidence: "1",
            userVerified: true,
            isEstimated: false,
          });
        }

        await this.audit.record({
          householdId: input.householdId,
          actorUserId: userId,
          action: "account.create",
          entity: "account",
          entityId: row.id,
          after: {
            name: row.name,
            accountType: row.accountType,
            ownerMemberId: row.ownerMemberId,
            isShared: row.isShared,
          },
          executor: tx,
        });

        return { accountId: row.id };
      },
    });

    const [row] = await getDb()
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId as string))
      .limit(1);
    if (!row) throw new NotFoundException("Account not found");
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

    if (input.ownerMemberId) {
      await this.requireMemberInHousehold(input.householdId, input.ownerMemberId);
    }

    const patch: Partial<typeof accounts.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.provider !== undefined) patch.provider = input.provider;
    if (input.isShared !== undefined) patch.isShared = input.isShared;
    if (input.ownerMemberId !== undefined) {
      patch.ownerMemberId = input.ownerMemberId;
    }
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

    const before = {
      name: existing.name,
      provider: existing.provider,
      isShared: existing.isShared,
      ownerMemberId: existing.ownerMemberId,
    };

    const [row] = await db
      .update(accounts)
      .set(patch)
      .where(eq(accounts.id, accountId))
      .returning();

    await this.audit.record({
      householdId: input.householdId,
      actorUserId: userId,
      action: "account.update",
      entity: "account",
      entityId: accountId,
      before,
      after: {
        name: row.name,
        provider: row.provider,
        isShared: row.isShared,
        ownerMemberId: row.ownerMemberId,
      },
    });

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

    await this.audit.record({
      householdId,
      actorUserId: userId,
      action: "account.archive",
      entity: "account",
      entityId: accountId,
      before: { archivedAt: null },
      after: { archivedAt: row.archivedAt?.toISOString() ?? null },
    });

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

    const asOf = await resolveHouseholdAsOf(householdId);
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

    let ledgerBalanceMinor = row.currentBalanceMinor;
    let reportedBalanceMinor = row.reportedBalanceMinor;
    let reconcileStatus: string | null = null;
    let differenceMinor: bigint | null = null;

    if (
      this.ledger &&
      (visibility === "full" || visibility === "balance")
    ) {
      const balances = await this.ledger.getAuthoritativeBalances(
        householdId,
        asOf,
      );
      const auth = balances.find((b) => b.accountId === accountId);
      if (auth) {
        ledgerBalanceMinor = auth.ledgerCalculatedBalanceMinor;
        reportedBalanceMinor = auth.reportedBalanceMinor;
        reconcileStatus = auth.reconcile.status;
        differenceMinor = auth.reconcile.differenceMinor;
      }
    }

    return {
      ...listItem,
      currentBalance: moneyToJson({
        amountMinor: ledgerBalanceMinor,
        currency: row.currency as "SEK",
      }),
      ledgerBalance: moneyToJson({
        amountMinor: ledgerBalanceMinor,
        currency: row.currency as "SEK",
      }),
      reportedBalance:
        reportedBalanceMinor != null
          ? moneyToJson({
              amountMinor: reportedBalanceMinor,
              currency: row.currency as "SEK",
            })
          : null,
      reconciliation:
        reconcileStatus != null
          ? {
              status: reconcileStatus,
              difference:
                differenceMinor != null
                  ? moneyToJson({
                      amountMinor: differenceMinor,
                      currency: row.currency as "SEK",
                    })
                  : null,
            }
          : null,
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
          amountMinor:
            h.ledgerCalculatedBalanceMinor ?? h.reportedBalanceMinor ?? 0n,
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
      ownerMemberId: row.ownerMemberId ?? null,
      // Caller overlays ledger-calculated balance before mapping when available.
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
