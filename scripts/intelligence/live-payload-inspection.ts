/**
 * Final-payload inspection before live AI calls (pilot §11–§12).
 *
 * Builds the EXACT payload the classification run would send — the production
 * `AiClassificationService.eligibility()` path, which redacts before it
 * judges — and verifies programmatically that nothing sensitive is in it.
 * Read-only: no writes, no provider calls.
 *
 * Prints verdicts and aggregate numbers only. Payload text is never printed:
 * the point is to prove properties of the content without logging the content.
 *
 *   cd apps/api && set -a && source ../../.env && set +a && \
 *     pnpm exec tsx ../../scripts/intelligence/live-payload-inspection.ts <householdId>
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../apps/api/src/db/client";
import { householdMembers, users } from "../../apps/api/src/db/schema";
import { AiClassificationService } from "../../apps/api/src/ai/classification/ai-classification.service";
import { HouseholdAccessService } from "../../apps/api/src/households/household-access.service";
import type {
  AllowedTaxonomyEntry,
  MinimizedClusterPayload,
} from "../../apps/api/src/ai/classification/provider";

/** The only keys a minimized cluster payload may carry (§8). */
const ALLOWED_KEYS = new Set([
  "clusterRef",
  "normalizedDescription",
  "sampleDescriptions",
  "direction",
  "accountType",
  "currency",
  "medianAmountMinor",
  "minAmountMinor",
  "maxAmountMinor",
  "occurrenceCount",
  "medianIntervalDays",
  "existingMerchantCandidate",
]);

/** Patterns that must never appear in text that leaves the system (§9, §11). */
const FORBIDDEN: Array<[string, RegExp]> = [
  ["personnummer", /\b(19|20)?\d{6}[-+]\d{4}\b/],
  ["long digit run (account/card/reference)", /\d{7,}/],
  ["phone number", /(\+46|0046)\s?\d/],
  ["IBAN", /\bSE\d{2}\s?(\d\s?){20}\b/i],
  ["email address", /@[a-z0-9.-]+\.[a-z]{2,}/i],
];

type EligibilityInternals = {
  eligibility(householdId: string): Promise<{
    eligible: Array<{ payload: MinimizedClusterPayload }>;
    taxonomy: AllowedTaxonomyEntry[];
    opaqueExcluded: number;
    unresolvedClusters: number;
  }>;
};

async function main(): Promise<void> {
  const householdId = process.argv[2];
  if (!householdId) {
    console.error("usage: live-payload-inspection.ts <householdId>");
    process.exitCode = 2;
    return;
  }

  const service = new AiClassificationService(new HouseholdAccessService());
  const report = await (service as unknown as EligibilityInternals).eligibility(
    householdId,
  );

  // THIS household's member names must not appear in what leaves the system.
  const memberNames = (
    await getDb()
      .select({ displayName: users.displayName })
      .from(householdMembers)
      .innerJoin(users, eq(users.id, householdMembers.userId))
      .where(eq(householdMembers.householdId, householdId))
  )
    .map((row) => row.displayName.toLowerCase())
    .filter((name) => name.length >= 4);

  console.log(`eligible clusters: ${report.eligible.length}`);
  console.log(`opaque excluded:   ${report.opaqueExcluded}`);
  console.log(`unresolved total:  ${report.unresolvedClusters}`);

  let failures = 0;
  const texts: string[] = [];
  for (const [index, entry] of report.eligible.entries()) {
    const payload = entry.payload;

    const extraKeys = Object.keys(payload).filter((key) => !ALLOWED_KEYS.has(key));
    if (extraKeys.length > 0) {
      failures += 1;
      console.log(`cluster #${index}: FAIL — unexpected fields ${extraKeys.join(", ")}`);
    }
    if (payload.sampleDescriptions.length > 5) {
      failures += 1;
      console.log(`cluster #${index}: FAIL — more than 5 sample descriptions`);
    }
    texts.push(
      payload.normalizedDescription,
      ...payload.sampleDescriptions,
      payload.existingMerchantCandidate ?? "",
    );
  }

  for (const [label, pattern] of FORBIDDEN) {
    const hit = texts.some((text) => pattern.test(text));
    if (hit) failures += 1;
    console.log(`forbidden content — ${label}: ${hit ? "FAIL (present)" : "PASS (absent)"}`);
  }

  const nameHit = texts.some((text) =>
    memberNames.some((name) => text.toLowerCase().includes(name)),
  );
  if (nameHit) failures += 1;
  console.log(
    `forbidden content — household member names: ${nameHit ? "FAIL (present)" : "PASS (absent)"}`,
  );

  const wire = JSON.stringify({
    clusters: report.eligible.map((entry) => entry.payload),
    allowedTaxonomy: report.taxonomy,
  });
  console.log(`payload size on the wire: ${wire.length.toLocaleString("en")} bytes`);
  console.log(`taxonomy entries offered: ${report.taxonomy.length}`);

  console.log(`\nPAYLOAD INSPECTION: ${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

void main()
  .catch((error: unknown) => {
    console.error(
      `inspection failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(() => {
    // Drizzle's pg pool keeps the loop alive otherwise.
    process.exit(process.exitCode ?? 0);
  });
