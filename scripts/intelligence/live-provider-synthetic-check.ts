/**
 * Live provider connectivity check — SYNTHETIC clusters only (pilot §5–§6).
 *
 * Run before any household-derived text is allowed to leave the system:
 *
 *   cd apps/api && set -a && source ../../.env && set +a && \
 *     pnpm exec tsx ../../scripts/intelligence/live-provider-synthetic-check.ts
 *
 * Verifies against the real OpenAI provider, through the exact production
 * code path (`OpenAITransactionClassificationProvider`):
 *   1. authentication works,
 *   2. structured output parses through the production Zod schema,
 *   3. taxonomy restriction holds (ids only from the allowed set, or null),
 *   4. a reference-only cluster comes back UNKNOWN, nothing fabricated,
 *   5. usage metadata is present.
 *
 * Prints only safe aggregates: no API key, no payload dumps beyond the
 * synthetic descriptions defined in this file.
 */

import {
  AI_CLASSIFICATION_SCHEMA_VERSION,
  TRANSACTION_CLASSIFIER_PROMPT_VERSION,
} from "@ffos/schemas";
import { readAiClassificationConfig } from "../../apps/api/src/ai/classification/ai-config";
import { OpenAITransactionClassificationProvider } from "../../apps/api/src/ai/classification/openai-provider";
import type {
  AllowedTaxonomyEntry,
  MinimizedClusterPayload,
} from "../../apps/api/src/ai/classification/provider";

const TAXONOMY: AllowedTaxonomyEntry[] = [
  { id: "11111111-1111-4111-8111-111111111111", key: "streaming", name: "Streaming och media", parentId: null },
  { id: "22222222-2222-4222-8222-222222222222", key: "groceries", name: "Livsmedel", parentId: null },
  { id: "33333333-3333-4333-8333-333333333333", key: "transport", name: "Transport och drivmedel", parentId: null },
  { id: "44444444-4444-4444-8444-444444444444", key: "housing", name: "Boende", parentId: null },
];

function synthetic(
  ref: string,
  description: string,
  amountMinor: string,
  options: Partial<MinimizedClusterPayload> = {},
): MinimizedClusterPayload {
  return {
    clusterRef: ref,
    normalizedDescription: description,
    sampleDescriptions: [description],
    direction: "OUTFLOW",
    accountType: "CHECKING",
    currency: "SEK",
    medianAmountMinor: amountMinor,
    minAmountMinor: amountMinor,
    maxAmountMinor: amountMinor,
    occurrenceCount: 12,
    medianIntervalDays: 30,
    existingMerchantCandidate: null,
    ...options,
  };
}

const CLUSTERS: MinimizedClusterPayload[] = [
  synthetic("syn-netflix", "NETFLIX.COM", "-17900"),
  synthetic("syn-ica", "ICA MAXI TEST", "-84300", {
    occurrenceCount: 30,
    medianIntervalDays: 6,
    minAmountMinor: "-24000",
    maxAmountMinor: "-160000",
  }),
  synthetic("syn-spotify", "SPOTIFY TEST", "-12900"),
  // Reference-only: the correct answer is UNKNOWN (§12, §19).
  synthetic("syn-opaque", "[REF] [REF]", "-25000", {
    occurrenceCount: 5,
    medianIntervalDays: null,
  }),
];

async function main(): Promise<void> {
  const config = readAiClassificationConfig();
  if (!config.apiKey) {
    console.error("OPENAI_API_KEY is not set in this shell; aborting.");
    process.exitCode = 2;
    return;
  }

  const provider = new OpenAITransactionClassificationProvider(config);
  console.log(`provider: ${provider.name}`);
  console.log(`model: ${provider.model}`);
  console.log(`clusters (synthetic): ${CLUSTERS.length}`);

  const started = Date.now();
  const response = await provider.classify({
    clusters: CLUSTERS,
    taxonomy: TAXONOMY,
    promptVersion: TRANSACTION_CLASSIFIER_PROMPT_VERSION,
    schemaVersion: AI_CLASSIFICATION_SCHEMA_VERSION,
  });
  const elapsed = Date.now() - started;

  // Structured output already passed the production Zod schema inside the
  // provider, or classify() would have thrown INVALID_RESPONSE.
  console.log("structured response: PASS (Zod schema validated)");
  console.log(`request count: 1, latency ${elapsed} ms`);
  console.log(
    `usage metadata: ${
      response.usage
        ? `PASS (prompt ${response.usage.promptTokens}, completion ${response.usage.completionTokens})`
        : "MISSING"
    }`,
  );

  const allowedIds = new Set(TAXONOMY.map((entry) => entry.id));
  let taxonomyOk = true;
  let echoedRefs = 0;
  for (const result of response.results) {
    if (CLUSTERS.some((cluster) => cluster.clusterRef === result.clusterRef)) {
      echoedRefs += 1;
    }
    if (result.categoryId && !allowedIds.has(result.categoryId)) taxonomyOk = false;
    if (result.subcategoryId && !allowedIds.has(result.subcategoryId)) taxonomyOk = false;
  }
  console.log(`results: ${response.results.length} of ${CLUSTERS.length}`);
  console.log(`clusterRef echo: ${echoedRefs}/${response.results.length}`);
  console.log(`taxonomy restriction: ${taxonomyOk ? "PASS" : "FAIL"}`);

  const opaque = response.results.find((result) => result.clusterRef === "syn-opaque");
  const opaqueOk =
    opaque == null ||
    (opaque.transactionType === "UNKNOWN" &&
      opaque.merchantCandidate == null &&
      opaque.categoryId == null);
  console.log(
    `UNKNOWN behaviour on reference-only cluster: ${opaqueOk ? "PASS" : "FAIL"} ` +
      `(merchant ${opaque?.merchantCandidate ?? "null"}, type ${opaque?.transactionType ?? "absent"})`,
  );

  // Aggregate view of the named synthetic brands — safe to print, they are
  // defined in this file.
  for (const ref of ["syn-netflix", "syn-ica", "syn-spotify"]) {
    const result = response.results.find((entry) => entry.clusterRef === ref);
    if (!result) {
      console.log(`${ref}: no result (treated as UNKNOWN by the pipeline)`);
      continue;
    }
    console.log(
      `${ref}: merchant=${result.merchantCandidate ?? "null"} ` +
        `(m=${result.merchantConfidence.toFixed(2)}, c=${result.classificationConfidence.toFixed(2)}), ` +
        `category=${result.categoryId ? TAXONOMY.find((t) => t.id === result.categoryId)?.key ?? "?" : "null"}, ` +
        `type=${result.transactionType}, recurring=${result.recurringTypeCandidate ?? "null"}`,
    );
  }

  const pass = taxonomyOk && opaqueOk && response.usage != null;
  console.log(`\nSYNTHETIC PROVIDER CHECK: ${pass ? "PASS" : "FAIL"}`);
  process.exitCode = pass ? 0 : 1;
}

void main().catch((error: unknown) => {
  // Never print the config object or headers — the message is enough.
  console.error(
    `provider check failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
