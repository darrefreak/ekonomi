import assert from "node:assert/strict";
import test from "node:test";
import * as bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { householdMembers, households, users } from "../db/schema";
import { documents } from "../db/schema-intake";
import { privacyRequests } from "../db/schema-ops";
import { AuditService } from "../audit/audit.service";
import { HouseholdAccessService } from "../households/household-access.service";
import { requireTestDatabase } from "../testing/require-test-database";
import { ErasureIncompleteError, ErasureService } from "../privacy/erasure.service";
import { PrivacyService } from "../privacy/privacy.service";
import { ObjectStorageService } from "./object-storage.service";

/**
 * The bucket named in a locator is the authority that must confirm the delete.
 *
 * These run against the development MinIO rather than a double, because the
 * defect was in how the SDK's answers were read and a double would only replay
 * my own assumptions about them (FIR-001).
 */

const ENDPOINT = process.env.FFOS_TEST_S3_ENDPOINT ?? "http://localhost:9000";
const REAL_BUCKET = "ffos";
const MISSING_BUCKET = "bucket-som-inte-finns";

function storageFor(overrides: Record<string, string> = {}) {
  const previous = { ...process.env };
  Object.assign(process.env, {
    S3_ENDPOINT: ENDPOINT,
    S3_ACCESS_KEY: "ffos",
    S3_SECRET_KEY: "ffossecret",
    S3_BUCKET: REAL_BUCKET,
    S3_REGION: "us-east-1",
    FFOS_STORAGE_DRIVER: "s3",
    ...overrides,
  });
  const service = new ObjectStorageService();
  process.env = previous;
  return service;
}

async function requireObjectStore() {
  const storage = storageFor();
  const stored = await storage.putObject({
    householdId: "reachability",
    filename: "probe.txt",
    contentType: "text/plain",
    body: Buffer.from("reachability"),
  });
  if (stored.driver !== "s3") {
    throw new Error(
      `These tests need the development object store at ${ENDPOINT}. ` +
        "Start it with `docker compose up -d minio`. A skip here would be the " +
        "same false green the erasure defect was made of.",
    );
  }
  await storage.deleteObject(stored.storageKey, stored.bucket);
  return storage;
}

const suffix = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function storeObject(storage: ObjectStorageService, body = "personnummer 19900101-1234") {
  return storage.putObject({
    householdId: `authority-${suffix()}`,
    filename: "kvitto.txt",
    contentType: "text/plain",
    body: Buffer.from(body),
  });
}

test("a key that is genuinely absent from a bucket that exists is confirmed absent", async () => {
  const storage = await requireObjectStore();
  const result = await storage.deleteObject(
    `households/none/documents/${suffix()}-never-written.txt`,
    REAL_BUCKET,
  );
  assert.equal(result.outcome, "ALREADY_ABSENT_CONFIRMED");
  assert.equal(result.errorKind, undefined);
});

test("an object that is there is deleted and confirmed gone", async () => {
  const storage = await requireObjectStore();
  const stored = await storeObject(storage);

  const result = await storage.deleteObject(stored.storageKey, stored.bucket);
  assert.equal(result.outcome, "DELETED_CONFIRMED");
  assert.equal(await storage.objectExists(stored.storageKey, stored.bucket), false);

  // Deleting it again is confirmed absence, not a second deletion.
  const again = await storage.deleteObject(stored.storageKey, stored.bucket);
  assert.equal(again.outcome, "ALREADY_ABSENT_CONFIRMED");
});

test("a bucket that does not exist fails; it is not absence", async () => {
  const storage = await requireObjectStore();
  const result = await storage.deleteObject(
    `households/none/documents/${suffix()}-ghost.txt`,
    MISSING_BUCKET,
  );
  assert.equal(result.outcome, "FAILED");
  assert.equal(result.errorKind, "BUCKET_NOT_FOUND");
});

test("the recorded bucket is used, not whatever the configuration now says", async () => {
  const storage = await requireObjectStore();
  const stored = await storeObject(storage);

  // The deployment's default bucket has been changed; the object is still in
  // the one its locator names.
  const renamed = storageFor({ S3_BUCKET: "ffos-new" });
  const result = await renamed.deleteObject(stored.storageKey, stored.bucket);

  assert.equal(result.outcome, "DELETED_CONFIRMED");
  assert.equal(result.bucket, REAL_BUCKET, "the locator's bucket, not the new default");
  assert.equal(await storage.objectExists(stored.storageKey, REAL_BUCKET), false);
});

test("a locator that names no bucket is a failure, not a guess", async () => {
  const storage = await requireObjectStore();
  const result = await storage.deleteObject(`households/none/documents/${suffix()}.txt`, null);
  assert.equal(result.outcome, "FAILED");
});

test("credentials that cannot delete fail closed and leave the object alone", async () => {
  const storage = await requireObjectStore();
  const stored = await storeObject(storage);

  const denied = storageFor({ S3_ACCESS_KEY: "wrong", S3_SECRET_KEY: "wrong-secret-value" });
  const result = await denied.deleteObject(stored.storageKey, stored.bucket);

  assert.equal(result.outcome, "FAILED");
  assert.equal(result.errorKind, "ACCESS_DENIED");
  assert.equal(
    await storage.objectExists(stored.storageKey, stored.bucket),
    true,
    "the object must survive a refused deletion",
  );

  await storage.deleteObject(stored.storageKey, stored.bucket);
});

test("an unreachable endpoint fails closed", async () => {
  await requireObjectStore();
  const offline = storageFor({ S3_ENDPOINT: "http://127.0.0.1:9" });
  const result = await offline.deleteObject(
    `households/none/documents/${suffix()}.txt`,
    REAL_BUCKET,
  );
  assert.equal(result.outcome, "FAILED");
  assert.ok(
    ["BACKEND_UNAVAILABLE", "TIMEOUT"].includes(result.errorKind ?? ""),
    `expected unavailability, got ${result.errorKind}`,
  );
});

// --- the same rule, seen through an erasure ---------------------------------

async function householdHolding(storage: ObjectStorageService, bucket: string) {
  const db = getDb();
  const tag = suffix();
  const [user] = await db
    .insert(users)
    .values({
      email: `authority-${tag}@ffos.local`,
      passwordHash: await bcrypt.hash("BucketAuthority123!", 4),
      displayName: "Authority",
    })
    .returning();
  const [household] = await db
    .insert(households)
    .values({ name: `Hinkmyndighet ${tag}`, baseCurrency: "SEK" })
    .returning();
  await db
    .insert(householdMembers)
    .values({ householdId: household.id, userId: user.id, role: "OWNER" });

  const stored = await storeObject(storage);
  await db.insert(documents).values({
    householdId: household.id,
    title: "Kvitto",
    originalFilename: "kvitto.txt",
    contentType: "text/plain",
    byteSize: stored.byteSize,
    storageKey: stored.storageKey,
    // The locator points at `bucket`, which may not be where the object is.
    bucket,
    checksumSha256: stored.checksumSha256,
  });
  return { user, household, stored };
}

test("an erasure whose locator names a missing bucket fails, keeps the row, and the object survives", async () => {
  requireTestDatabase();
  const storage = await requireObjectStore();
  const access = new HouseholdAccessService();
  const audit = new AuditService();
  const privacy = new PrivacyService(access, audit);
  const erasure = new ErasureService(access, audit, storage);

  const { user, household, stored } = await householdHolding(storage, MISSING_BUCKET);
  const request = await privacy.requestDelete(user.id, {
    householdId: household.id,
    kind: "delete_household",
    note: "bucket authority",
  });

  await assert.rejects(
    erasure.confirm(user.id, request.id, { householdName: household.name }),
    (error: unknown) => error instanceof ErasureIncompleteError,
    "a locator pointing at a bucket that does not exist must not complete",
  );

  const db = getDb();
  const [row] = await db
    .select({ status: privacyRequests.status, householdId: privacyRequests.householdId })
    .from(privacyRequests)
    .where(eq(privacyRequests.id, request.id))
    .limit(1);
  assert.equal(row?.status, "failed");
  assert.equal(row?.householdId, household.id, "the request must still know what to erase");

  const remaining = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.householdId, household.id));
  assert.equal(remaining.length, 1, "the locator is the only way to find the object again");

  const stillThere = await db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.id, household.id));
  assert.equal(stillThere.length, 1);

  assert.equal(
    await storage.objectExists(stored.storageKey, REAL_BUCKET),
    true,
    "and the object itself is untouched, where it actually lives",
  );

  // Repairing the locator lets the retry finish, and it really removes the object.
  await db
    .update(documents)
    .set({ bucket: REAL_BUCKET })
    .where(eq(documents.householdId, household.id));

  const summary = await erasure.execute(request.id, user.id);
  assert.equal(summary.status, "completed");
  assert.equal(summary.objectsRemoved, 1);
  assert.equal(
    await storage.objectExists(stored.storageKey, REAL_BUCKET),
    false,
    "completed now means the object is gone",
  );
});

test("COMPLETED is provable: every object the household held is confirmed absent", async () => {
  requireTestDatabase();
  const storage = await requireObjectStore();
  const access = new HouseholdAccessService();
  const audit = new AuditService();
  const privacy = new PrivacyService(access, audit);
  const erasure = new ErasureService(access, audit, storage);
  const db = getDb();

  const { user, household, stored } = await householdHolding(storage, REAL_BUCKET);
  // A second and third object, so the invariant is not satisfied by there
  // being only one thing to get right.
  const extras = [await storeObject(storage), await storeObject(storage)];
  for (const extra of extras) {
    await db.insert(documents).values({
      householdId: household.id,
      title: "Kvitto",
      originalFilename: "kvitto.txt",
      contentType: "text/plain",
      byteSize: extra.byteSize,
      storageKey: extra.storageKey,
      bucket: extra.bucket,
      checksumSha256: extra.checksumSha256,
    });
  }

  const manifest = [stored, ...extras].map((object) => ({
    storageKey: object.storageKey,
    bucket: object.bucket,
  }));
  for (const entry of manifest) {
    assert.equal(
      await storage.objectExists(entry.storageKey, entry.bucket),
      true,
      "the fixture must actually be in the store before the erasure means anything",
    );
  }

  const request = await privacy.requestDelete(user.id, {
    householdId: household.id,
    kind: "delete_household",
    note: "manifest",
  });
  const summary = await erasure.confirm(user.id, request.id, {
    householdName: household.name,
  });

  assert.equal(summary.status, "completed");
  assert.equal(summary.objectsRemoved, manifest.length);

  for (const entry of manifest) {
    assert.equal(
      await storage.objectExists(entry.storageKey, entry.bucket),
      false,
      `${entry.bucket}/${entry.storageKey} still exists after a completed erasure`,
    );
  }
});

test("a completed erasure never counts an object it did not remove", async () => {
  requireTestDatabase();
  const storage = await requireObjectStore();
  const access = new HouseholdAccessService();
  const audit = new AuditService();
  const privacy = new PrivacyService(access, audit);
  const erasure = new ErasureService(access, audit, storage);

  const { user, household, stored } = await householdHolding(storage, REAL_BUCKET);
  // Somebody else removed the object between upload and erasure.
  await storage.deleteObject(stored.storageKey, REAL_BUCKET);

  const request = await privacy.requestDelete(user.id, {
    householdId: household.id,
    kind: "delete_household",
    note: "already absent",
  });
  const summary = await erasure.confirm(user.id, request.id, {
    householdName: household.name,
  });

  assert.equal(summary.status, "completed", "confirmed absence is a good erasure");
  assert.equal(summary.objectsRemoved, 0, "we did not remove it, so we must not say we did");
  assert.equal(summary.objectsAlreadyAbsent, 1);
});
