import {
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import {
  matchMerchant,
  normalizeMerchantText,
  suggestAliasFromRaw,
  type MerchantRecord,
} from "@ffos/financial-engine";
import type { VerifyMerchantAliasInput } from "@ffos/schemas";
import { AuditService } from "../audit/audit.service";
import { getDb } from "../db/client";
import { merchants } from "../db/schema-economic";
import { HouseholdAccessService } from "../households/household-access.service";

@Injectable()
export class MerchantsService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async loadMerchantRecords(householdId: string): Promise<MerchantRecord[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(merchants)
      .where(eq(merchants.householdId, householdId));
    return rows.map((r) => ({
      id: r.id,
      canonicalName: r.canonicalName,
      aliases: r.aliases ?? [],
      normalizedTokens: r.normalizedTokens ?? [],
      confidence: r.confidence != null ? Number(r.confidence) : 1,
      userVerified: r.userVerified,
    }));
  }

  async normalizePreview(userId: string, householdId: string, raw: string) {
    await this.access.requireMembership(userId, householdId);
    const records = await this.loadMerchantRecords(householdId);
    return matchMerchant(raw, records);
  }

  /** Resolve merchant id from raw description; preserves raw text at call sites. */
  async resolveMerchantId(
    householdId: string,
    rawDescription: string,
  ): Promise<string | undefined> {
    const trimmed = rawDescription?.trim();
    if (!trimmed) return undefined;

    const records = await this.loadMerchantRecords(householdId);
    const matched = matchMerchant(trimmed, records);
    if (matched.match && matched.match.confidence >= 0.85) {
      return matched.match.merchantId;
    }

    const db = getDb();
    const [existing] = await db
      .select({ id: merchants.id })
      .from(merchants)
      .where(
        and(
          eq(merchants.householdId, householdId),
          sql`lower(${merchants.canonicalName}) = lower(${trimmed})`,
        ),
      )
      .limit(1);
    if (existing) return existing.id;

    const normalized = normalizeMerchantText(trimmed);
    const [created] = await db
      .insert(merchants)
      .values({
        householdId,
        canonicalName: trimmed,
        aliases: [],
        normalizedTokens: normalized.tokens,
        confidence: "0.50",
        userVerified: false,
      })
      .returning();
    return created.id;
  }

  async verifyAlias(userId: string, input: VerifyMerchantAliasInput) {
    await this.access.requireMembership(userId, input.householdId);
    const db = getDb();
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(
        and(
          eq(merchants.id, input.merchantId),
          eq(merchants.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!merchant) throw new NotFoundException("Merchant not found");

    const alias = suggestAliasFromRaw(input.rawDescription);
    const aliases = [...(merchant.aliases ?? [])];
    const aliasAdded = !aliases.some(
      (a) => a.toUpperCase() === alias.toUpperCase(),
    );
    if (aliasAdded) aliases.push(alias);

    const normalized = normalizeMerchantText(input.rawDescription);
    const [updated] = await db
      .update(merchants)
      .set({
        aliases,
        normalizedTokens: normalized.tokens,
        userVerified: true,
        confidence: "0.98",
        updatedAt: new Date(),
      })
      .where(eq(merchants.id, input.merchantId))
      .returning();

    await this.audit.record({
      householdId: input.householdId,
      actorUserId: userId,
      action: "merchant.verify_alias",
      entity: "merchant",
      entityId: input.merchantId,
      before: {
        aliases: merchant.aliases,
        userVerified: merchant.userVerified,
      },
      after: {
        aliases: updated.aliases,
        userVerified: updated.userVerified,
        rawDescription: input.rawDescription,
        alias,
      },
      source: "api",
    });

    return {
      merchantId: updated.id,
      canonicalName: updated.canonicalName,
      aliasAdded: alias,
      userVerified: true as const,
    };
  }
}
