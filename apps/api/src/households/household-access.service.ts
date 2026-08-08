import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { AccessPolicy, HouseholdRole } from "@ffos/domain";
import { getDb } from "../db/client";
import { householdMembers, households } from "../db/schema";

export type HouseholdMemberRow = typeof householdMembers.$inferSelect;

export type ViewerContext = {
  household: typeof households.$inferSelect;
  member: HouseholdMemberRow;
  role: HouseholdRole;
  personalDataPolicy: AccessPolicy;
};

export type AccountVisibility = "full" | "balance" | "aggregate" | "hidden";

const WRITE_ROLES: HouseholdRole[] = ["OWNER", "ADMIN", "ADULT"];
const ADMIN_ROLES: HouseholdRole[] = ["OWNER", "ADMIN"];

@Injectable()
export class HouseholdAccessService {
  async requireMembership(userId: string, householdId: string) {
    return this.getViewerContext(userId, householdId);
  }

  async getViewerContext(
    userId: string,
    householdId: string,
  ): Promise<ViewerContext> {
    const db = getDb();
    const [household] = await db
      .select()
      .from(households)
      .where(eq(households.id, householdId))
      .limit(1);
    if (!household) {
      throw new NotFoundException("Household not found");
    }

    const [member] = await db
      .select()
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!member) {
      throw new ForbiddenException("Not a member of this household");
    }

    return {
      household,
      member,
      role: member.role as HouseholdRole,
      personalDataPolicy: member.personalDataPolicy as AccessPolicy,
    };
  }

  async requireRole(
    userId: string,
    householdId: string,
    allowed: HouseholdRole[],
  ): Promise<ViewerContext> {
    const ctx = await this.getViewerContext(userId, householdId);
    if (!allowed.includes(ctx.role)) {
      throw new ForbiddenException(
        `Role ${ctx.role} cannot perform this action`,
      );
    }
    return ctx;
  }

  async requireCanWrite(
    userId: string,
    householdId: string,
  ): Promise<ViewerContext> {
    return this.requireRole(userId, householdId, WRITE_ROLES);
  }

  async requireAdmin(
    userId: string,
    householdId: string,
  ): Promise<ViewerContext> {
    return this.requireRole(userId, householdId, ADMIN_ROLES);
  }

  /**
   * Resolve visibility of an account for the viewer based on sharing +
   * the account owner's personalDataPolicy.
   */
  async accountVisibility(
    viewer: ViewerContext,
    account: {
      isShared: boolean;
      ownerMemberId: string | null;
    },
  ): Promise<AccountVisibility> {
    if (account.isShared) return "full";
    if (!account.ownerMemberId) return "full";
    if (account.ownerMemberId === viewer.member.id) return "full";
    if (ADMIN_ROLES.includes(viewer.role)) return "full";

    const db = getDb();
    const [owner] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, account.ownerMemberId))
      .limit(1);
    const policy = (owner?.personalDataPolicy ??
      "FULL_DETAILS") as AccessPolicy;

    if (policy === "FULL_DETAILS") return "full";
    if (policy === "OWNER_ONLY") return "hidden";
    if (policy === "BALANCE_ONLY") return "balance";
    if (policy === "AGGREGATES_ONLY") return "aggregate";
    return "aggregate";
  }

  projectAccountListItem<T extends Record<string, unknown>>(
    item: T,
    visibility: AccountVisibility,
  ): T | null {
    if (visibility === "hidden") return null;
    if (visibility === "full") return item;
    const balance = item.currentBalance as
      | { amountMinor: string; currency: string }
      | undefined;
    return {
      ...item,
      provider: null,
      externalReference: null,
      connectionStatus: "DISCONNECTED",
      freshnessLabel: null,
      ownerMemberId: null,
      name:
        visibility === "balance"
          ? "Personligt konto (saldo)"
          : "Personligt konto (aggregat)",
      currentBalance:
        visibility === "aggregate" && balance
          ? { amountMinor: "0", currency: balance.currency }
          : item.currentBalance,
      privacyRedacted: true,
      privacyLevel: visibility,
    };
  }

  /**
   * Personal transactions: full detail, balance-only redaction, or omit
   * (aggregate / hidden — amounts belong in household aggregates only).
   */
  projectTransactionItem<T extends Record<string, unknown>>(
    item: T,
    visibility: AccountVisibility,
  ): T | null {
    if (visibility === "hidden" || visibility === "aggregate") return null;
    if (visibility === "full") return item;
    return {
      ...item,
      description: "Dold transaktion",
      accountName: "Personligt konto (saldo)",
      merchantName: null,
      merchantId: null,
      categoryName: null,
      categoryId: null,
      notes: null,
      tags: [],
      privacyRedacted: true,
      privacyLevel: visibility,
    };
  }
}
