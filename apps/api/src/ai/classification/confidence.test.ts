import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiClusterClassification } from "@ffos/schemas";
import {
  AUTO_APPLY_THRESHOLD,
  combineConfidence,
  SUGGEST_THRESHOLD,
} from "./confidence";
import type { MinimizedClusterPayload } from "./provider";

/*
 * Combined confidence (§13): the model's self-confidence is 40 % of the
 * decision; the other 60 % is evidence the system can verify locally. These
 * tests pin the routing behaviour the integration suite depends on.
 */

function cluster(partial: Partial<MinimizedClusterPayload> = {}): MinimizedClusterPayload {
  return {
    clusterRef: "c1",
    normalizedDescription: "NETFLIX.COM [KORT]",
    sampleDescriptions: ["NETFLIX.COM [KORT]"],
    direction: "OUTFLOW",
    accountType: "CHECKING",
    currency: "SEK",
    medianAmountMinor: "-16900",
    minAmountMinor: "-16900",
    maxAmountMinor: "-16900",
    occurrenceCount: 12,
    medianIntervalDays: 30,
    existingMerchantCandidate: null,
    ...partial,
  };
}

function result(partial: Partial<AiClusterClassification> = {}): AiClusterClassification {
  return {
    clusterRef: "c1",
    merchantCandidate: "Netflix",
    merchantConfidence: 0.95,
    categoryId: null,
    subcategoryId: null,
    transactionType: "PURCHASE",
    recurringTypeCandidate: "SUBSCRIPTION",
    classificationConfidence: 0.95,
    shortExplanation: "Known streaming brand with monthly cadence.",
    signals: ["KNOWN_BRAND", "RECURRING_CADENCE"],
    ...partial,
  };
}

test("strong local evidence + confident model clears the auto-apply threshold", () => {
  /*
   * Everything corroborates: the merchant token is in the text, the text has
   * real semantic content, 12 samples, stable monthly amount, and the
   * deterministic candidate engine already reached the same name. Nothing
   * less clears 0.95 — auto-apply is earned, not defaulted.
   */
  const breakdown = combineConfidence(
    result(),
    cluster({
      normalizedDescription: "NETFLIX COM STREAMING",
      sampleDescriptions: ["NETFLIX COM STREAMING"],
      minAmountMinor: "16900",
      maxAmountMinor: "16900",
      medianAmountMinor: "16900",
      existingMerchantCandidate: "Netflix",
    }),
  );
  assert.equal(breakdown.merchantTokenEvidence, 1, "NETFLIX is in the text");
  assert.ok(
    breakdown.combined >= AUTO_APPLY_THRESHOLD,
    `expected >= ${AUTO_APPLY_THRESHOLD}, got ${breakdown.combined}`,
  );
});

test("without candidate agreement or rich text, the same claim only suggests", () => {
  const breakdown = combineConfidence(result(), cluster());
  assert.ok(breakdown.combined >= SUGGEST_THRESHOLD);
  assert.ok(
    breakdown.combined < AUTO_APPLY_THRESHOLD,
    `expected < ${AUTO_APPLY_THRESHOLD}, got ${breakdown.combined}`,
  );
});

test("a merchant the model cannot point to in the text never auto-applies", () => {
  const breakdown = combineConfidence(
    result({ merchantCandidate: "Willys", classificationConfidence: 0.99 }),
    cluster(),
  );
  assert.equal(breakdown.merchantTokenEvidence, 0, "WILLYS is not in NETFLIX text");
  assert.ok(
    breakdown.combined < AUTO_APPLY_THRESHOLD,
    "self-confidence alone cannot cross the auto-apply bar",
  );
});

test("one observation is an anecdote: low sample size drags confidence down", () => {
  const many = combineConfidence(result(), cluster({ occurrenceCount: 12 }));
  const one = combineConfidence(result(), cluster({ occurrenceCount: 1 }));
  assert.ok(one.combined < many.combined);
});

test("disagreement with the deterministic candidate costs more than no candidate", () => {
  const agrees = combineConfidence(
    result(),
    cluster({ existingMerchantCandidate: "Netflix" }),
  );
  const disagrees = combineConfidence(
    result(),
    cluster({ existingMerchantCandidate: "HBO Max" }),
  );
  const noCandidate = combineConfidence(result(), cluster());
  assert.ok(agrees.combined > noCandidate.combined);
  assert.ok(disagrees.combined < noCandidate.combined);
});

test("a weak, textless guess lands below the suggest threshold", () => {
  const breakdown = combineConfidence(
    result({
      merchantCandidate: "Okänd Firma",
      classificationConfidence: 0.4,
    }),
    cluster({
      normalizedDescription: "[REF]",
      sampleDescriptions: ["[REF]"],
      occurrenceCount: 1,
      medianIntervalDays: null,
    }),
  );
  assert.ok(
    breakdown.combined < SUGGEST_THRESHOLD,
    `expected < ${SUGGEST_THRESHOLD}, got ${breakdown.combined}`,
  );
});

test("combined confidence is deterministic and clamped to [0, 1]", () => {
  const a = combineConfidence(result(), cluster());
  const b = combineConfidence(result(), cluster());
  assert.equal(a.combined, b.combined);
  assert.ok(a.combined >= 0 && a.combined <= 1);
});
