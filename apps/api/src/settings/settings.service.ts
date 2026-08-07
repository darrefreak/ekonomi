import {
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { UpdateSettingsInput } from "@ffos/schemas";
import { getDb } from "../db/client";
import { householdMembers, households, users } from "../db/schema";
import { householdSettings } from "../db/schema-ops";
import { HouseholdAccessService } from "../households/household-access.service";

@Injectable()
export class SettingsService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

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

    return {
      householdId,
      householdName: household.name,
      locale: row.locale,
      appearance: row.appearance as "system" | "light" | "dark",
      financialPolicies: {
        minimumCashBalanceMinor: row.minimumCashBalanceMinor.toString(),
        emergencyFundTargetMinor: row.emergencyFundTargetMinor.toString(),
        safetyMarginMinor: row.safetyMarginMinor.toString(),
        currency: row.currency,
      },
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        displayName: m.displayName,
        role: m.role,
        personalDataPolicy: m.personalDataPolicy,
      })),
    };
  }

  async update(userId: string, input: UpdateSettingsInput) {
    await this.access.requireMembership(userId, input.householdId);
    const db = getDb();
    await this.ensureRow(input.householdId);

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
    if (input.financialPolicies?.safetyMarginMinor != null) {
      patch.safetyMarginMinor = BigInt(
        input.financialPolicies.safetyMarginMinor,
      );
    }
    if (input.financialPolicies?.currency) {
      patch.currency = input.financialPolicies.currency;
    }

    await db
      .update(householdSettings)
      .set(patch)
      .where(eq(householdSettings.householdId, input.householdId));

    if (input.memberPolicy) {
      const [member] = await db
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.id, input.memberPolicy.memberId))
        .limit(1);
      if (!member || member.householdId !== input.householdId) {
        throw new NotFoundException("Member not found");
      }
      await db
        .update(householdMembers)
        .set({
          personalDataPolicy: input.memberPolicy.personalDataPolicy,
          updatedAt: new Date(),
        })
        .where(eq(householdMembers.id, member.id));
    }

    return this.get(userId, input.householdId);
  }
}
