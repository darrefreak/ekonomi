import assert from "node:assert/strict";
import test from "node:test";
import {
  aiClassificationBatchResponseSchema,
  aiClusterClassificationSchema,
} from "./ai-classification";

/**
 * The wire boundary must degrade per RESULT, not per batch (live pilot).
 *
 * Strict structured output guarantees shape, types and enums; it does not
 * guarantee string lengths, array lengths or numeric ranges. The first live
 * provider run returned a non-uuid categoryId (the household had no
 * categories) and the previous `.uuid()` constraint failed the whole batch —
 * seven clusters became seven ERRORs over one bad value. These tests pin the
 * corrected behaviour: value drift is normalized or passed through to the
 * service's semantic validation, never a batch-level parse failure.
 */

const sound = {
  clusterRef: "abc123",
  merchantCandidate: "Zapstream Media",
  merchantConfidence: 0.9,
  categoryId: null,
  subcategoryId: null,
  transactionType: "PURCHASE",
  recurringTypeCandidate: "SUBSCRIPTION",
  classificationConfidence: 0.9,
  shortExplanation: "Månatlig mediatjänst.",
  signals: ["MERCHANT_NAME_IN_TEXT"],
};

test("a non-uuid categoryId parses and survives to be rejected by taxonomy validation", () => {
  const parsed = aiClusterClassificationSchema.parse({
    ...sound,
    categoryId: "groceries",
  });
  assert.equal(parsed.categoryId, "groceries");
});

test("empty-string text fields normalize to null instead of failing the parse", () => {
  const parsed = aiClusterClassificationSchema.parse({
    ...sound,
    merchantCandidate: "  ",
    categoryId: "",
  });
  assert.equal(parsed.merchantCandidate, null);
  assert.equal(parsed.categoryId, null);
});

test("out-of-range confidences clamp to [0, 1] instead of failing the batch", () => {
  const parsed = aiClusterClassificationSchema.parse({
    ...sound,
    merchantConfidence: 1.4,
    classificationConfidence: -0.2,
  });
  assert.equal(parsed.merchantConfidence, 1);
  assert.equal(parsed.classificationConfidence, 0);
});

test("overlong explanations and signal lists are truncated, not fatal", () => {
  const parsed = aiClusterClassificationSchema.parse({
    ...sound,
    shortExplanation: "x".repeat(500),
    signals: Array(12).fill("KNOWN_BRAND"),
  });
  assert.equal(parsed.shortExplanation.length, 300);
  assert.equal(parsed.signals.length, 8);
});

test("one bad value in a batch does not take the sound results with it", () => {
  const parsed = aiClassificationBatchResponseSchema.parse({
    results: [sound, { ...sound, clusterRef: "def456", categoryId: "not-a-uuid" }],
  });
  assert.equal(parsed.results.length, 2);
});

test("structural violations still fail loudly", () => {
  assert.throws(() =>
    aiClusterClassificationSchema.parse({ ...sound, transactionType: "GAMBLING" }),
  );
  assert.throws(() =>
    aiClusterClassificationSchema.parse({ ...sound, signals: ["MADE_UP_SIGNAL"] }),
  );
  assert.throws(() => aiClusterClassificationSchema.parse({ ...sound, clusterRef: "" }));
});
