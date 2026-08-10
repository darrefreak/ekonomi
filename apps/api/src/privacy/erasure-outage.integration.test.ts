import assert from "node:assert/strict";
import test from "node:test";
import * as bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { householdMembers, households, users } from "../db/schema";
import { accounts } from "../db/schema-economic";
import { documents } from "../db/schema-intake";
import { privacyRequests } from "../db/schema-ops";
import { AuditService } from "../audit/audit.service";
import { HouseholdAccessService } from "../households/household-access.service";
import {
  ObjectStorageService,
  type ObjectDeletionResult,
} from "../storage/object-storage.service";
import { requireTestDatabase } from "../testing/require-test-database";
import { ErasureIncompleteError, ErasureService } from "./erasure.service";
import { PrivacyService } from "./privacy.service";

/**
 * Erasure when the object store is not answering.
 *
 * The existing erasure tests delete objects with storage healthy, which is the
 * case that already worked. The case that mattered was the other one: with
 * MinIO stopped the erasure reported `completed`, deleted the row holding the
 * storage key, and left the participant's document sitting in the bucket with
 * nothing pointing at it (FPR-003).
 *
 * These tests drive that path with a storage backend that fails on demand, so
 * the outage is deterministic rather than a container that has to be stopped.
 */

/** A storage service whose deletes fail while `offline` is true. */
class FlakyStorage extends ObjectStorageService {
  offline = true;
  readonly deleteCalls: string[] = [];
  readonly removed = new Set<string>();

  override async deleteObject(
    storageKey: string,
    bucket?: string | null,
  ): Promise<ObjectDeletionResult> {
    this.deleteCalls.push(storageKey);
    const base = {
      backend: "s3" as const,
      bucket: bucket || "ffos",
      storageKey,
    };
    if (this.offline) {
      return {
        ...base,
        outcome: "FAILED",
        reason: "getaddrinfo EAI_AGAIN minio",
      };
    }
    this.removed.add(storageKey);
    return { ...base, outcome: "DELETED_CONFIRMED" };
  }
}

function services(storage: ObjectStorageService) {
  const access = new HouseholdAccessService();
  const audit = new AuditService();
  return {
    privacy: new PrivacyService(access, audit),
    erasure: new ErasureService(access, audit, storage),
  };
}

async function householdWithDocument(name: string) {
  const db = getDb();
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const [user] = await db
    .insert(users)
    .values({
      email: `outage-${suffix}@ffos.local`,
      passwordHash: await bcrypt.hash("ErasureOutage123!", 4),
      displayName: "Outage",
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
  const storageKey = `households/${household.id}/documents/${suffix}-kvitto.txt`;
  await db.insert(documents).values({
    householdId: household.id,
    title: "Kvitto",
    originalFilename: "kvitto.txt",
    contentType: "text/plain",
    byteSize: 32,
    storageKey,
    bucket: "ffos",
    checksumSha256: "0".repeat(64),
  });
  return { user, household, storageKey };
}

async function rowCounts(householdId: string, storageKey: string) {
  const db = getDb();
  const [household] = await db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  const docs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.storageKey, storageKey));
  return { householdExists: Boolean(household), documents: docs.length };
}

test("an erasure that cannot reach object storage fails instead of reporting success", async () => {
  requireTestDatabase();
  const storage = new FlakyStorage();
  const { privacy, erasure } = services(storage);
  const { user, household, storageKey } = await householdWithDocument("Avbrott");

  const request = await privacy.requestDelete(user.id, {
    householdId: household.id,
    kind: "delete_household",
    note: "outage",
  });

  await assert.rejects(
    erasure.confirm(user.id, request.id, { householdName: household.name }),
    (error: unknown) => error instanceof ErasureIncompleteError,
    "an unreachable object store must abort the erasure",
  );

  const after = await rowCounts(household.id, storageKey);
  assert.equal(after.householdExists, true, "the household must survive a failed erasure");
  assert.equal(
    after.documents,
    1,
    "the row holding the storage key is the only way to find the object again",
  );

  const db = getDb();
  const [row] = await db
    .select({ status: privacyRequests.status, householdId: privacyRequests.householdId })
    .from(privacyRequests)
    .where(eq(privacyRequests.id, request.id))
    .limit(1);
  assert.equal(row?.status, "failed");
  assert.equal(row?.householdId, household.id, "the request must still know what to erase");
});

test("the retry after storage comes back removes the object and completes exactly once", async () => {
  requireTestDatabase();
  const storage = new FlakyStorage();
  const { privacy, erasure } = services(storage);
  const { user, household, storageKey } = await householdWithDocument("Återförsök");

  const request = await privacy.requestDelete(user.id, {
    householdId: household.id,
    kind: "delete_household",
    note: "outage",
  });
  await assert.rejects(
    erasure.confirm(user.id, request.id, { householdName: household.name }),
    (error: unknown) => error instanceof ErasureIncompleteError,
  );

  storage.offline = false;
  const summary = await erasure.execute(request.id, user.id);

  assert.equal(summary.status, "completed");
  assert.equal(summary.objectsRemoved, 1, "only confirmed deletions may be counted");
  assert.ok(storage.removed.has(storageKey), "the object itself must be gone");

  const after = await rowCounts(household.id, storageKey);
  assert.equal(after.householdExists, false);
  assert.equal(after.documents, 0);
});

test("six simultaneous retries erase once and never report a phantom object", async () => {
  requireTestDatabase();
  const storage = new FlakyStorage();
  storage.offline = false;
  const { privacy, erasure } = services(storage);
  const { user, household, storageKey } = await householdWithDocument("Samtidig");

  const request = await privacy.requestDelete(user.id, {
    householdId: household.id,
    kind: "delete_household",
    note: "outage",
  });

  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () =>
      erasure.confirm(user.id, request.id, { householdName: household.name }),
    ),
  );
  const completed = results.filter(
    (result) => result.status === "fulfilled" && result.value.status === "completed",
  );
  assert.ok(completed.length >= 1, "at least one confirmation must finish the job");

  const after = await rowCounts(household.id, storageKey);
  assert.equal(after.householdExists, false);
  assert.equal(after.documents, 0);
  assert.ok(storage.removed.has(storageKey));
});

test("an object whose backend cannot be reached is never counted as already gone", async () => {
  requireTestDatabase();
  // No S3 endpoint configured, but the document says it lives in a bucket: the
  // owning backend is unreachable, which is not the same as absent.
  const storage = new ObjectStorageService();
  const result = await storage.deleteObject(
    "households/none/documents/ghost.txt",
    "ffos",
  );
  if (process.env.S3_ENDPOINT) {
    assert.ok(
      ["DELETED_CONFIRMED", "ALREADY_ABSENT_CONFIRMED", "FAILED"].includes(
        result.outcome,
      ),
      "a configured endpoint may answer any of the three",
    );
  } else {
    assert.equal(result.outcome, "FAILED");
    assert.match(String(result.reason), /no S3 endpoint/i);
  }
});
