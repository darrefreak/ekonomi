import assert from "node:assert/strict";
import test from "node:test";
import * as bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { getDb } from "../db/client";
import { householdMembers, households, users } from "../db/schema";
import { accounts } from "../db/schema-economic";
import { privacyRequests } from "../db/schema-ops";
import { AuditService } from "../audit/audit.service";
import { HouseholdAccessService } from "../households/household-access.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { requireTestDatabase } from "../testing/require-test-database";
import { ErasureService } from "./erasure.service";
import { PrivacyService } from "./privacy.service";

function services() {
  const access = new HouseholdAccessService();
  const audit = new AuditService();
  const storage = new ObjectStorageService();
  return {
    privacy: new PrivacyService(access, audit),
    erasure: new ErasureService(access, audit, storage),
  };
}

/** A household nobody else touches, built directly so the test owns its fixture. */
async function makeHousehold(name: string) {
  const db = getDb();
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const [user] = await db
    .insert(users)
    .values({
      email: `erasure-${suffix}@ffos.local`,
      passwordHash: await bcrypt.hash("ErasureTest123!", 4),
      displayName: "Erasure",
    })
    .returning();
  const [household] = await db
    .insert(households)
    .values({ name: `${name} ${suffix}`, baseCurrency: "SEK" })
    .returning();
  await db
    .insert(householdMembers)
    .values({ householdId: household.id, userId: user.id, role: "OWNER" });
  await db.insert(accounts).values({
    householdId: household.id,
    name: "Lönekonto",
    accountType: "CHECKING",
    currency: "SEK",
    openingBalanceMinor: 100000n,
    currentBalanceMinor: 100000n,
    isShared: true,
  });
  return { user, household };
}

async function householdExists(id: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.id, id))
    .limit(1);
  return Boolean(row);
}

test("a deletion request on its own erases nothing", async () => {
  requireTestDatabase();
  const { privacy } = services();
  const { user, household } = await makeHousehold("Begäran");

  const request = await privacy.requestDelete(user.id, {
    householdId: household.id,
    kind: "delete_household",
  });

  assert.equal(request.status, "requested");
  assert.equal(
    await householdExists(household.id),
    true,
    "asking must never be the same as doing",
  );

  const db = getDb();
  const [remaining] = await db
    .select({ count: sql<string>`count(*)` })
    .from(accounts)
    .where(eq(accounts.householdId, household.id));
  assert.equal(Number(remaining?.count ?? 0) > 0, true);
});

test("confirming with the wrong household name changes nothing", async () => {
  requireTestDatabase();
  const { privacy, erasure } = services();
  const { user, household } = await makeHousehold("Fel namn");
  const request = await privacy.requestDelete(user.id, {
    householdId: household.id,
    kind: "delete_household",
  });

  await assert.rejects(() =>
    erasure.confirm(user.id, request.id, { householdName: "Något annat" }),
  );
  assert.equal(await householdExists(household.id), true);
});

test("an outsider cannot confirm someone else's erasure", async () => {
  requireTestDatabase();
  const { privacy, erasure } = services();
  const { user, household } = await makeHousehold("Utomstående");
  const other = await makeHousehold("Annat hushåll");
  const request = await privacy.requestDelete(user.id, {
    householdId: household.id,
    kind: "delete_household",
  });

  await assert.rejects(
    () =>
      erasure.confirm(other.user.id, request.id, {
        householdName: household.name,
      }),
    ForbiddenException,
  );
  assert.equal(await householdExists(household.id), true);
});

test("a confirmed erasure removes the household and leaves no orphans", async () => {
  requireTestDatabase();
  const { privacy, erasure } = services();
  const { user, household } = await makeHousehold("Radering");
  const request = await privacy.requestDelete(user.id, {
    householdId: household.id,
    kind: "delete_household",
  });

  const summary = await erasure.confirm(user.id, request.id, {
    householdName: household.name,
  });

  assert.equal(summary.status, "completed");
  assert.equal(await householdExists(household.id), false);

  const db = getDb();
  const [orphans] = await db
    .select({ count: sql<string>`count(*)` })
    .from(accounts)
    .where(eq(accounts.householdId, household.id));
  assert.equal(Number(orphans?.count ?? 0), 0);
});

test("erasure is retry-safe and resurrects nothing", async () => {
  requireTestDatabase();
  const { privacy, erasure } = services();
  const { user, household } = await makeHousehold("Återförsök");
  const request = await privacy.requestDelete(user.id, {
    householdId: household.id,
    kind: "delete_household",
  });

  await erasure.confirm(user.id, request.id, { householdName: household.name });
  const again = await erasure.execute(request.id, user.id);

  assert.equal(again.status, "completed");
  assert.equal(await householdExists(household.id), false);
});

test("a cancelled request cannot then be executed", async () => {
  requireTestDatabase();
  const { privacy, erasure } = services();
  const { user, household } = await makeHousehold("Avbruten");
  const request = await privacy.requestDelete(user.id, {
    householdId: household.id,
    kind: "delete_household",
  });

  await erasure.cancel(user.id, request.id);
  await assert.rejects(
    () => erasure.confirm(user.id, request.id, { householdName: household.name }),
    ConflictException,
  );
  assert.equal(await householdExists(household.id), true);
});

test("the request that survives an erasure carries no personal trace", async () => {
  requireTestDatabase();
  const { privacy, erasure } = services();
  const { user, household } = await makeHousehold("Spår");
  const request = await privacy.requestDelete(user.id, {
    householdId: household.id,
    kind: "delete_household",
    note: "Radera allt om min ekonomi",
  });

  await erasure.confirm(user.id, request.id, { householdName: household.name });

  const db = getDb();
  const [row] = await db
    .select()
    .from(privacyRequests)
    .where(eq(privacyRequests.id, request.id))
    .limit(1);
  assert.equal(row?.note, null, "the participant's own words must not survive");
  assert.equal(row?.householdId, null);
  assert.equal(row?.status, "completed");
});

test("the sole owner of a shared household cannot delete themselves", async () => {
  requireTestDatabase();
  const { erasure } = services();
  const { user, household } = await makeHousehold("Delat");
  const bystander = await makeHousehold("Medlem");
  const db = getDb();
  await db
    .insert(householdMembers)
    .values({ householdId: household.id, userId: bystander.user.id, role: "ADULT" });

  await assert.rejects(() => erasure.deleteSelf(user.id), ConflictException);
  assert.equal(
    await householdExists(household.id),
    true,
    "the refusal must not half-delete anything",
  );
});

test("deleting a user takes the household only they could reach", async () => {
  requireTestDatabase();
  const { erasure } = services();
  const { user, household } = await makeHousehold("Ensam");

  const result = await erasure.deleteSelf(user.id);

  assert.equal(result.deleted, true);
  assert.equal(result.householdsErased, 1);
  assert.equal(await householdExists(household.id), false);

  const db = getDb();
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  assert.equal(row, undefined);
});
