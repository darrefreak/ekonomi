import assert from "node:assert/strict";
import { requireTestDatabase } from "../testing/require-test-database";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  merchantNormalizeResponseSchema,
  verifyMerchantAliasResponseSchema,
} from "@ffos/schemas";
import { AuditService } from "../audit/audit.service";
import { getDb } from "../db/client";
import { households, householdMembers, users } from "../db/schema";
import { merchants } from "../db/schema-economic";
import type { HouseholdAccessService } from "../households/household-access.service";
import { MerchantsService } from "./merchants.service";

async function setup() {
  requireTestDatabase();
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name: `P1-U6 merch ${Date.now()}`, baseCurrency: "SEK" })
    .returning();
  const [owner] = await db
    .insert(users)
    .values({
      email: `p1u6-merch-${Date.now()}@example.test`,
      passwordHash: "hash",
      displayName: "Owner",
    })
    .returning();
  await db.insert(householdMembers).values({
    householdId: household.id,
    userId: owner.id,
    role: "OWNER",
  });
  const [merchant] = await db
    .insert(merchants)
    .values({
      householdId: household.id,
      canonicalName: "ICA Supermarket",
      aliases: ["ICA"],
    })
    .returning();
  return { household, owner, merchant, db };
}

test("P1-U6: normalize preview matches alias", async () => {
  const ctx = await setup();
  const { household, owner, merchant } = ctx;

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: "m", role: "OWNER" },
    }),
  } as unknown as HouseholdAccessService;

  const svc = new MerchantsService(access, new AuditService());
  const preview = merchantNormalizeResponseSchema.parse(
    await svc.normalizePreview(owner.id, household.id, "ICA"),
  );

  assert.equal(preview.rawDescription, "ICA");
  assert.ok(preview.match);
  assert.equal(preview.match?.merchantId, merchant.id);

  const noisy = merchantNormalizeResponseSchema.parse(
    await svc.normalizePreview(owner.id, household.id, "ICA STOCKHOLM 1234"),
  );
  assert.equal(noisy.needsReview, true);
});

test("P1-U6: verify alias adds alias and sets userVerified", async () => {
  const ctx = await setup();
  const { household, owner, merchant, db } = ctx;

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: "m", role: "OWNER" },
    }),
  } as unknown as HouseholdAccessService;

  const svc = new MerchantsService(access, new AuditService());
  const result = verifyMerchantAliasResponseSchema.parse(
    await svc.verifyAlias(owner.id, {
      householdId: household.id,
      merchantId: merchant.id,
      rawDescription: "ICA KVANTUM SÖDER",
    }),
  );

  assert.equal(result.userVerified, true);
  assert.ok(result.aliasAdded.length > 0);

  const [updated] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.id, merchant.id))
    .limit(1);
  assert.equal(updated.userVerified, true);
  assert.ok((updated.aliases ?? []).some((a) => a.includes("ICA")));
});

test("P1-U6: resolveMerchantId uses matchMerchant", async () => {
  const ctx = await setup();
  const { household, merchant } = ctx;

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: "m", role: "OWNER" },
    }),
  } as unknown as HouseholdAccessService;

  const svc = new MerchantsService(access, new AuditService());
  const id = await svc.resolveMerchantId(household.id, "ICA");
  assert.equal(id, merchant.id);
});
