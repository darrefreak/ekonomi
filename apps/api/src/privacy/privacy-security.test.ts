import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { JwtService } from "@nestjs/jwt";
import { ForbiddenException } from "@nestjs/common";
import { getDb } from "../db/client";
import {
  householdMembers,
  households,
  refreshTokens,
  users,
} from "../db/schema";
import { accounts } from "../db/schema-economic";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import { HouseholdAccessService } from "../households/household-access.service";
import { AccountsService } from "../accounts/accounts.service";
import { TransactionsService } from "../transactions/transactions.service";
import { SettingsService } from "../settings/settings.service";
import { PrivacyService } from "./privacy.service";
import { requireAccessSecret } from "../common/jwt-secrets";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

test("requireAccessSecret fails closed in production without secret", () => {
  const prevEnv = process.env.NODE_ENV;
  const prevSecret = process.env.JWT_ACCESS_SECRET;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_ACCESS_SECRET;
    assert.throws(() => requireAccessSecret(), /JWT_ACCESS_SECRET/);
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = prevSecret;
  }
});

test("roles privacy logout and export against real DB", async () => {
  if (!process.env.DATABASE_URL) return;

  const db = getDb();
  const [demoUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, "demo@ffos.local"))
    .limit(1);
  if (!demoUser) return;

  const [ownerMembership] = await db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.userId, demoUser.id))
    .limit(1);
  if (!ownerMembership) return;

  const householdId = ownerMembership.householdId;
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  if (!household) return;

  const access = new HouseholdAccessService();
  const audit = new AuditService();
  const accountsService = new AccountsService(access, audit);
  const txService = new TransactionsService(access, audit);
  const settings = new SettingsService(access, audit);
  const privacy = new PrivacyService(access, audit);
  const auth = new AuthService(new JwtService({}), audit);

  const suffix = Date.now().toString(36);
  const viewerEmail = `viewer-n-${suffix}@ffos.local`;
  const passwordHash = await bcrypt.hash("viewer-password-123", 10);
  const [viewerUser] = await db
    .insert(users)
    .values({
      email: viewerEmail,
      passwordHash,
      displayName: "Viewer N",
    })
    .returning();

  const [viewerMember] = await db
    .insert(householdMembers)
    .values({
      householdId,
      userId: viewerUser.id,
      role: "VIEWER",
      personalDataPolicy: "FULL_DETAILS",
    })
    .returning();

  // Owner personal policy → AGGREGATES_ONLY for other members
  await db
    .update(householdMembers)
    .set({ personalDataPolicy: "AGGREGATES_ONLY", updatedAt: new Date() })
    .where(eq(householdMembers.id, ownerMembership.id));

  const personal = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.householdId, householdId),
        eq(accounts.isShared, false),
        eq(accounts.ownerMemberId, ownerMembership.id),
      ),
    )
    .limit(1);
  assert.ok(personal[0], "demo should have a personal account");

  // VIEWER cannot write
  await assert.rejects(
    () =>
      accountsService.create(viewerUser.id, {
        householdId,
        name: `Denied ${suffix}`,
        accountType: "CHECKING",
        currency: "SEK",
        isShared: true,
        openingBalanceMinor: "0",
      }),
    (err: unknown) => err instanceof ForbiddenException,
  );

  // AGGREGATES_ONLY redacts personal accounts from viewer list
  const viewerList = await accountsService.list(viewerUser.id, householdId);
  const personalHit = viewerList.items.find((a) => a.id === personal[0]!.id) as
    | (typeof viewerList.items)[number] & {
        privacyRedacted?: boolean;
        privacyLevel?: string;
      }
    | undefined;
  if (personalHit) {
    assert.equal(personalHit.privacyRedacted, true);
    assert.equal(personalHit.privacyLevel, "aggregate");
    assert.equal(personalHit.currentBalance.amountMinor, "0");
  } else {
    // hidden-equivalent omit is also acceptable for aggregate
    assert.equal(personalHit, undefined);
  }

  const ownerList = await accountsService.list(demoUser.id, householdId);
  assert.ok(ownerList.items.some((a) => a.id === personal[0]!.id));

  const viewerTx = await txService.list(viewerUser.id, householdId, {
    accountId: personal[0]!.id,
    limit: 20,
  });
  assert.equal(
    viewerTx.items.length,
    0,
    "aggregate viewers must not see personal transaction lines",
  );

  // IDOR: foreign household
  const foreignId = "00000000-0000-4000-8000-000000000099";
  await assert.rejects(
    () => accountsService.list(viewerUser.id, foreignId),
    (err: unknown) =>
      err instanceof ForbiddenException ||
      (err as { status?: number }).status === 404 ||
      (err as { name?: string }).name === "NotFoundException",
  );

  // Admin can set policy via settings
  const updated = await settings.update(demoUser.id, {
    householdId,
    memberPolicy: {
      memberId: ownerMembership.id,
      personalDataPolicy: "FULL_DETAILS",
    },
  });
  const ownerRow = updated.members.find((m) => m.id === ownerMembership.id);
  assert.equal(ownerRow?.personalDataPolicy, "FULL_DETAILS");

  // Export foundation
  const exported = await privacy.export(demoUser.id, householdId);
  assert.equal(exported.householdId, householdId);
  assert.ok(exported.data.user);
  assert.ok(Array.isArray(exported.data.accounts));

  // Logout revokes refresh token
  const tokens = await auth.login({
    email: viewerEmail,
    password: "viewer-password-123",
  });
  await auth.logout(viewerUser.id, tokens.tokens.refreshToken);
  const [revoked] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.userId, viewerUser.id),
        eq(refreshTokens.tokenHash, hashToken(tokens.tokens.refreshToken)),
      ),
    )
    .limit(1);
  assert.ok(revoked?.revokedAt);

  await assert.rejects(
    () => auth.refresh(tokens.tokens.refreshToken),
    (err: unknown) =>
      (err as { name?: string }).name === "UnauthorizedException" ||
      (err as { status?: number }).status === 401,
  );

  // Cleanup viewer (keep demo household intact)
  await db
    .delete(refreshTokens)
    .where(eq(refreshTokens.userId, viewerUser.id));
  await db
    .delete(householdMembers)
    .where(eq(householdMembers.id, viewerMember.id));
  await db.delete(users).where(eq(users.id, viewerUser.id));

});
