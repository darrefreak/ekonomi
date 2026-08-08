import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { anomalyFindings } from "../db/schema-decisions";
import { AnomalyService } from "./anomaly.service";

test("AnomalyService detects deterministically and upserts by identity key", async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.name, "Familjen Demo"))
    .limit(1);
  if (!household) return;

  const anomaly = new AnomalyService();
  const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";

  const detected = await anomaly.detectAll(household.id, asOf);
  for (const f of detected) {
    assert.ok(f.id.length > 0);
    assert.ok(["low", "medium", "high"].includes(f.severity));
    assert.ok(f.facts.length >= 1);
  }

  const detectedAgain = await anomaly.detectAll(household.id, asOf);
  assert.deepEqual(
    detected.map((f) => f.id).sort(),
    detectedAgain.map((f) => f.id).sort(),
  );

  await anomaly.run(household.id, asOf);
  const persisted = await anomaly.list(household.id);
  const persistedKeys = new Set(persisted.items.map((r) => r.identityKey));
  for (const f of detected) {
    assert.ok(persistedKeys.has(f.id));
  }

  // Re-running should upsert, not duplicate, existing findings for this asOf.
  await anomaly.run(household.id, asOf);
  const rowsAfterSecondRun = await db
    .select()
    .from(anomalyFindings)
    .where(eq(anomalyFindings.householdId, household.id));
  const countForAsOf = rowsAfterSecondRun.filter((r) => r.asOf === asOf).length;
  assert.equal(countForAsOf, detected.length);
});
