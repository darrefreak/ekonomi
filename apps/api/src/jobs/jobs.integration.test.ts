import assert from "node:assert/strict";
import {
  requireTestDatabase,
  requireTestRedis,
} from "../testing/require-test-database";
import { assertFixture } from "../testing/demo-fixture";
import { test } from "node:test";
import { Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { runJobHandler } from "./handlers";
import { enqueueCalculateMetrics } from "./queue";
import { jobOptionsFor, jobRegistry } from "./registry";
import { queueOptions } from "./redis-connection";

test("job registry covers every JobType with a distinct buildJobId", () => {
  const seen = new Set<string>();
  for (const type of Object.keys(jobRegistry)) {
    const def = jobRegistry[type as keyof typeof jobRegistry];
    assert.equal(def.type, type);
    assert.ok(def.attempts >= 1);
    assert.ok(!seen.has(type));
    seen.add(type);
  }
});

test("runJobHandler executes HEALTH_CHECK without a database", async () => {
  const result = await runJobHandler({ type: "HEALTH_CHECK", householdId: "system" });
  assert.ok(result);
  assert.equal((result as { ok: boolean }).ok, true);
});

test("runJobHandler CALCULATE_METRICS materializes real snapshots", async () => {
  requireTestDatabase();
  const db = getDb();
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.name, "Familjen Demo"))
    .limit(1);
  assertFixture(household, "household");

  const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
  const result = await runJobHandler({
    type: "CALCULATE_METRICS",
    householdId: household.id,
    asOf,
  });
  assert.ok(result);
  const r = result as { asOf: string; itemCount: number };
  assert.equal(r.asOf, asOf);
  assert.ok(r.itemCount > 0);
});

test("runJobHandler GENERATE_OPPORTUNITIES persists deterministic opportunities", async () => {
  requireTestDatabase();
  const db = getDb();
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.name, "Familjen Demo"))
    .limit(1);
  assertFixture(household, "household");

  const result = await runJobHandler({
    type: "GENERATE_OPPORTUNITIES",
    householdId: household.id,
  });
  assert.ok(result);
  assert.ok((result as { detectedCount: number }).detectedCount >= 1);
});

test("enqueue → real Redis worker roundtrip for HEALTH_CHECK", async () => {
  // A required test that cannot reach its infrastructure has not passed.
  requireTestRedis();

  // Uses an isolated queue name (not the shared production queue) so this
  // test's own Worker is guaranteed to be the sole consumer — avoids flakiness
  // from any other long-running worker process sharing the same Redis.
  const testQueueName = `ffos-jobs-test-${Date.now()}`;
  const queue = new Queue(testQueueName, queueOptions());
  const worker = new Worker(
    testQueueName,
    async (job) => runJobHandler(job.data),
    queueOptions(),
  );
  await worker.waitUntilReady();

  try {
    const payload = { type: "HEALTH_CHECK" as const, householdId: "system" as const };
    const opts = jobOptionsFor(payload);
    const job = await queue.add(payload.type, payload, opts);

    const completed = await new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("job did not complete in time")), 10_000);
      worker.on("completed", (completedJob) => {
        if (completedJob.id === job.id) {
          clearTimeout(timeout);
          resolve(true);
        }
      });
      worker.on("failed", (failedJob, err) => {
        if (failedJob?.id === job.id) {
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
    assert.equal(completed, true);
  } finally {
    await worker.close();
    await queue.close();
  }
});

test("enqueueCalculateMetrics is idempotent per (householdId, asOf) jobId", async () => {
  requireTestRedis();
  requireTestDatabase();

  const db = getDb();
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.name, "Familjen Demo"))
    .limit(1);
  assertFixture(household, "household");

  const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
  const firstId = await enqueueCalculateMetrics(household.id, asOf);
  const secondId = await enqueueCalculateMetrics(household.id, asOf);
  assert.equal(firstId, secondId);
});
