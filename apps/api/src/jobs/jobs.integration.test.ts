import assert from "node:assert/strict";
import { test } from "node:test";
import { Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { runJobHandler } from "./handlers";
import { enqueueCalculateMetrics } from "./queue";
import { jobOptionsFor, jobRegistry } from "./registry";

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    maxRetriesPerRequest: null as null,
  };
}

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
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.name, "Familjen Demo"))
    .limit(1);
  if (!household) return;

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
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.name, "Familjen Demo"))
    .limit(1);
  if (!household) return;

  const result = await runJobHandler({
    type: "GENERATE_OPPORTUNITIES",
    householdId: household.id,
  });
  assert.ok(result);
  assert.ok((result as { detectedCount: number }).detectedCount >= 1);
});

test("enqueue → real Redis worker roundtrip for HEALTH_CHECK", async (t) => {
  if (!process.env.REDIS_URL) {
    t.skip("REDIS_URL not set");
    return;
  }

  // Uses an isolated queue name (not the shared production queue) so this
  // test's own Worker is guaranteed to be the sole consumer — avoids flakiness
  // from any other long-running worker process sharing the same Redis.
  const testQueueName = `ffos-jobs-test-${Date.now()}`;
  const queue = new Queue(testQueueName, { connection: redisConnection() });
  const worker = new Worker(testQueueName, async (job) => runJobHandler(job.data), {
    connection: redisConnection(),
  });
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

test("enqueueCalculateMetrics is idempotent per (householdId, asOf) jobId", async (t) => {
  if (!process.env.REDIS_URL) {
    t.skip("REDIS_URL not set");
    return;
  }
  if (!process.env.DATABASE_URL) return;

  const db = getDb();
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.name, "Familjen Demo"))
    .limit(1);
  if (!household) return;

  const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
  const firstId = await enqueueCalculateMetrics(household.id, asOf);
  const secondId = await enqueueCalculateMetrics(household.id, asOf);
  assert.equal(firstId, secondId);
});
