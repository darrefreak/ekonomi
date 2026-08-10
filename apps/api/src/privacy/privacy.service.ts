import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import type { PrivacyDeleteRequest } from "@ffos/schemas";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { accounts, sourceTransactions } from "../db/schema-economic";
import { privacyRequests } from "../db/schema-ops";
import { HouseholdAccessService } from "../households/household-access.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class PrivacyService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async export(userId: string, householdId: string) {
    const viewer = await this.access.requireMembership(userId, householdId);
    const db = getDb();

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const memberAccounts = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        accountType: accounts.accountType,
        currency: accounts.currency,
        isShared: accounts.isShared,
        ownerMemberId: accounts.ownerMemberId,
        currentBalanceMinor: accounts.currentBalanceMinor,
      })
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          eq(accounts.ownerMemberId, viewer.member.id),
        ),
      );

    const ownedAccountIds = memberAccounts.map((a) => a.id);
    const allPersonalTx =
      ownedAccountIds.length === 0
        ? []
        : await db
            .select({
              id: sourceTransactions.id,
              accountId: sourceTransactions.accountId,
              bookingDate: sourceTransactions.bookingDate,
              description: sourceTransactions.description,
              amountMinor: sourceTransactions.amountMinor,
              currency: sourceTransactions.currency,
            })
            .from(sourceTransactions)
            .where(
              and(
                eq(sourceTransactions.householdId, householdId),
                inArray(sourceTransactions.accountId, ownedAccountIds),
              ),
            )
            .limit(2000);

    const [request] = await db
      .insert(privacyRequests)
      .values({
        householdId,
        userId,
        kind: "export",
        status: "completed",
        payload: { accountCount: memberAccounts.length },
      })
      .returning();

    await this.audit.record({
      householdId,
      actorUserId: userId,
      action: "privacy.export",
      entity: "privacy_request",
      entityId: request.id,
      after: { kind: "export", status: "completed" },
    });

    return {
      householdId,
      exportedAt: new Date().toISOString(),
      requestId: request.id,
      data: {
        user: user
          ? {
              id: user.id,
              email: user.email,
              displayName: user.displayName,
              createdAt: user.createdAt.toISOString(),
            }
          : null,
        membership: {
          memberId: viewer.member.id,
          role: viewer.role,
          personalDataPolicy: viewer.personalDataPolicy,
          householdName: viewer.household.name,
        },
        accounts: memberAccounts.map((a) => ({
          id: a.id,
          name: a.name,
          accountType: a.accountType,
          currency: a.currency,
          isShared: a.isShared,
          currentBalanceMinor: a.currentBalanceMinor.toString(),
        })),
        transactions: allPersonalTx.map((t) => ({
          id: t.id,
          accountId: t.accountId,
          bookingDate: String(t.bookingDate),
          description: t.description,
          amountMinor: t.amountMinor.toString(),
          currency: t.currency,
        })),
      },
    };
  }

  async requestDelete(userId: string, input: PrivacyDeleteRequest) {
    const householdId = input.householdId;
    if (input.kind === "delete_household") {
      await this.access.requireAdmin(userId, householdId);
    } else {
      await this.access.requireMembership(userId, householdId);
    }

    const db = getDb();
    const [request] = await db
      .insert(privacyRequests)
      .values({
        householdId,
        userId,
        kind: input.kind ?? "delete_personal",
        status: "requested",
        note: input.note ?? null,
        payload: { foundation: true },
      })
      .returning();

    await this.audit.record({
      householdId,
      actorUserId: userId,
      action: "privacy.delete_request",
      entity: "privacy_request",
      entityId: request.id,
      after: {
        kind: request.kind,
        status: request.status,
        note: request.note,
      },
    });

    return {
      id: request.id,
      householdId,
      kind: request.kind,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
    };
  }

  async listRequests(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const rows = await db
      .select()
      .from(privacyRequests)
      .where(
        and(
          eq(privacyRequests.householdId, householdId),
          eq(privacyRequests.userId, userId),
        ),
      );
    return {
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
