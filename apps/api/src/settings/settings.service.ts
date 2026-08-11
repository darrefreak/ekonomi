import {
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { UpdateSettingsInput } from "@ffos/schemas";
import { getDb } from "../db/client";
import { householdInvitations, householdMembers, households, users } from "../db/schema";
import { householdSettings } from "../db/schema-ops";
import { HouseholdAccessService } from "../households/household-access.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class SettingsService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listAuditLogs(userId: string, householdId: string) {
    await this.access.requireAdmin(userId, householdId);
    return this.audit.list(householdId);
  }

  private async ensureRow(householdId: string) {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(householdSettings)
      .where(eq(householdSettings.householdId, householdId))
      .limit(1);
    if (existing) return existing;
    const [created] = await db
      .insert(householdSettings)
      .values({ householdId })
      .returning();
    return created;
  }

  async get(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const row = await this.ensureRow(householdId);
    const db = getDb();
    const members = await db
      .select({
        id: householdMembers.id,
        userId: householdMembers.userId,
        displayName: users.displayName,
        role: householdMembers.role,
        personalDataPolicy: householdMembers.personalDataPolicy,
      })
      .from(householdMembers)
      .innerJoin(users, eq(householdMembers.userId, users.id))
      .where(eq(householdMembers.householdId, householdId));

    const invitations = await db
      .select()
      .from(householdInvitations)
      .where(
        and(
          eq(householdInvitations.householdId, householdId),
          eq(householdInvitations.status, "PENDING"),
        ),
      );

    return {
      householdId,
      householdName: household.name,
      locale: row.locale,
      appearance: row.appearance as "system" | "light" | "dark",
      financialPolicies: {
        minimumCashBalanceMinor: row.minimumCashBalanceMinor.toString(),
        emergencyFundTargetMinor: row.emergencyFundTargetMinor.toString(),
        safetyMarginMinor: row.safetyMarginMinor.toString(),
        savingsRateTargetPercent: Number(row.savingsRateTargetPercent),
        maxFixedCostRatioPercent: Number(row.maxFixedCostRatioPercent),
        investmentContributionTargetMinor:
          row.investmentContributionTargetMinor.toString(),
        currency: row.currency,
      },
      aiTransactionAnalysisEnabled: row.aiTransactionAnalysisEnabled,
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        displayName: m.displayName,
        role: m.role,
        personalDataPolicy: m.personalDataPolicy,
      })),
      invitations: invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        status: i.status,
        expiresAt: i.expiresAt.toISOString(),
        createdAt: i.createdAt.toISOString(),
      })),
    };
  }

  async update(userId: string, input: UpdateSettingsInput) {
    await this.access.requireCanWrite(userId, input.householdId);
    if (input.memberPolicy) {
      await this.access.requireAdmin(userId, input.householdId);
    }

    const db = getDb();
    const existingRow = await this.ensureRow(input.householdId);

    if (input.householdName) {
      await db
        .update(households)
        .set({ name: input.householdName, updatedAt: new Date() })
        .where(eq(households.id, input.householdId));
    }

    const patch: Partial<typeof householdSettings.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.locale) patch.locale = input.locale;
    if (input.appearance) patch.appearance = input.appearance;
    if (input.financialPolicies?.minimumCashBalanceMinor != null) {
      patch.minimumCashBalanceMinor = BigInt(
        input.financialPolicies.minimumCashBalanceMinor,
      );
    }
    if (input.financialPolicies?.emergencyFundTargetMinor != null) {
      patch.emergencyFundTargetMinor = BigInt(
        input.financialPolicies.emergencyFundTargetMinor,
      );
    }
    if (input.financialPolicies?.savingsRateTargetPercent != null) {
      patch.savingsRateTargetPercent = String(
        input.financialPolicies.savingsRateTargetPercent,
      );
    }
    if (input.financialPolicies?.maxFixedCostRatioPercent != null) {
      patch.maxFixedCostRatioPercent = String(
        input.financialPolicies.maxFixedCostRatioPercent,
      );
    }
    if (input.financialPolicies?.investmentContributionTargetMinor != null) {
      patch.investmentContributionTargetMinor = BigInt(
        input.financialPolicies.investmentContributionTargetMinor,
      );
    }
    if (input.financialPolicies?.safetyMarginMinor != null) {
      patch.safetyMarginMinor = BigInt(
        input.financialPolicies.safetyMarginMinor,
      );
    }
    if (input.financialPolicies?.currency) {
      patch.currency = input.financialPolicies.currency;
    }
    if (input.aiTransactionAnalysisEnabled != null) {
      patch.aiTransactionAnalysisEnabled = input.aiTransactionAnalysisEnabled;
    }

    await db
      .update(householdSettings)
      .set(patch)
      .where(eq(householdSettings.householdId, input.householdId));

    if (Object.keys(patch).length > 1 || input.householdName) {
      await this.audit.record({
        householdId: input.householdId,
        actorUserId: userId,
        action: "settings.update_policy",
        entity: "household_settings",
        entityId: input.householdId,
        before: {
          locale: existingRow.locale,
          appearance: existingRow.appearance,
          minimumCashBalanceMinor: existingRow.minimumCashBalanceMinor.toString(),
          emergencyFundTargetMinor: existingRow.emergencyFundTargetMinor.toString(),
          safetyMarginMinor: existingRow.safetyMarginMinor.toString(),
          savingsRateTargetPercent: existingRow.savingsRateTargetPercent,
          maxFixedCostRatioPercent: existingRow.maxFixedCostRatioPercent,
          investmentContributionTargetMinor:
            existingRow.investmentContributionTargetMinor.toString(),
          currency: existingRow.currency,
          aiTransactionAnalysisEnabled: existingRow.aiTransactionAnalysisEnabled,
        },
        after: {
          ...(input.householdName ? { householdName: input.householdName } : {}),
          ...(input.locale ? { locale: input.locale } : {}),
          ...(input.appearance ? { appearance: input.appearance } : {}),
          ...(input.aiTransactionAnalysisEnabled != null
            ? { aiTransactionAnalysisEnabled: input.aiTransactionAnalysisEnabled }
            : {}),
          ...(input.financialPolicies ?? {}),
        },
      });
    }

    if (input.memberPolicy) {
      const [member] = await db
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.id, input.memberPolicy.memberId))
        .limit(1);
      if (!member || member.householdId !== input.householdId) {
        throw new NotFoundException("Member not found");
      }
      const before = { personalDataPolicy: member.personalDataPolicy };
      await db
        .update(householdMembers)
        .set({
          personalDataPolicy: input.memberPolicy.personalDataPolicy,
          updatedAt: new Date(),
        })
        .where(eq(householdMembers.id, member.id));
      await this.audit.record({
        householdId: input.householdId,
        actorUserId: userId,
        action: "privacy.policy_update",
        entity: "household_member",
        entityId: member.id,
        before,
        after: { personalDataPolicy: input.memberPolicy.personalDataPolicy },
      });
    }

    return this.get(userId, input.householdId);
  }
}
