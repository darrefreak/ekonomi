import assert from "node:assert/strict";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import type { CurrencyCode } from "@ffos/domain";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { opportunities } from "../db/schema-decisions";
import { OpportunitiesGeneratorService } from "./opportunities-generator.service";

test("OpportunitiesGeneratorService detects and persists deterministic opportunities", async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.name, "Familjen Demo"))
    .limit(1);
  if (!household) return;

  const generator = new OpportunitiesGeneratorService();
  const currency = (household.baseCurrency || "SEK") as CurrencyCode;
  const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";

  const detected = await generator.detectAll(household.id, currency, asOf);
  assert.ok(detected.length >= 1, "expected at least one detected opportunity");
  for (const opp of detected) {
    assert.ok(opp.identityKey.length > 0);
    assert.ok(opp.calculationVersion.startsWith("opp-"));
    assert.ok(opp.inputHash.length > 0);
    assert.ok(opp.confidence.confidenceScore >= 0 && opp.confidence.confidenceScore <= 1);
    assert.ok(["low", "medium", "high"].includes(opp.confidence.label));
    assert.ok(opp.priority.priorityScore >= 0 && opp.priority.priorityScore <= 1);
  }

  // Deterministic inputs → identical detection on repeated calls (idempotent formulas).
  const detectedAgain = await generator.detectAll(household.id, currency, asOf);
  assert.deepEqual(
    detected.map((o) => o.identityKey).sort(),
    detectedAgain.map((o) => o.identityKey).sort(),
  );
  assert.deepEqual(
    detected.map((o) => o.inputHash).sort(),
    detectedAgain.map((o) => o.inputHash).sort(),
  );

  await generator.generate(household.id, currency, asOf);
  const rows = await db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.householdId, household.id),
        eq(opportunities.asOf, asOf),
      ),
    );
  const persistedKeys = new Set(rows.map((r) => r.identityKey));
  for (const opp of detected) {
    assert.ok(persistedKeys.has(opp.identityKey), `expected ${opp.identityKey} to be persisted`);
  }

  // Re-running generate() upserts (no duplicate identity keys) rather than inserting twice.
  await generator.generate(household.id, currency, asOf);
  const rowsAfterSecondRun = await db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.householdId, household.id),
        eq(opportunities.asOf, asOf),
      ),
    );
  assert.equal(rowsAfterSecondRun.length, rows.length);
});
