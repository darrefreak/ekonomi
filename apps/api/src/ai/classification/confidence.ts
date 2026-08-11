import type { AiClusterClassification } from "@ffos/schemas";
import type { MinimizedClusterPayload } from "./provider";

/**
 * Combined confidence: the model's self-confidence is one input, never the
 * decision (§13).
 *
 * Deterministic and unit-tested. The evidence terms are things the system can
 * verify locally: does the proposed merchant actually appear in the text, how
 * many observations exist, does an existing deterministic candidate agree,
 * is there a recurrence pattern, is the amount stable.
 */

export const AUTO_APPLY_THRESHOLD = 0.95;
export const SUGGEST_THRESHOLD = 0.75;

export type ConfidenceBreakdown = {
  combined: number;
  modelConfidence: number;
  merchantTokenEvidence: number;
  descriptionQuality: number;
  sampleSizeFactor: number;
  candidateAgreement: number;
  recurrenceConsistency: number;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Letters-only tokens of length >= 3 — the part of a description that means something. */
function semanticTokens(text: string): string[] {
  return (text.toUpperCase().match(/[A-ZÅÄÖ]{3,}/gu) ?? []).filter(
    (token) => !["REF", "KORT", "KONTO", "PNR", "IBAN", "TEL"].includes(token),
  );
}

export function combineConfidence(
  result: AiClusterClassification,
  cluster: MinimizedClusterPayload,
): ConfidenceBreakdown {
  const modelConfidence = clamp01(result.classificationConfidence);

  /*
   * Merchant token evidence: the proposed merchant name should be visible in
   * the redacted text. A merchant the model cannot point to in the input is a
   * guess, whatever its self-confidence says.
   */
  const haystack = [cluster.normalizedDescription, ...cluster.sampleDescriptions]
    .join(" ")
    .toUpperCase();
  let merchantTokenEvidence = 0;
  if (result.merchantCandidate) {
    const tokens = semanticTokens(result.merchantCandidate);
    if (tokens.length > 0) {
      const found = tokens.filter((token) => haystack.includes(token)).length;
      merchantTokenEvidence = found / tokens.length;
    }
  }

  // Description quality: how much semantic text exists at all.
  const descriptionTokens = semanticTokens(cluster.normalizedDescription);
  const descriptionQuality = clamp01(descriptionTokens.length / 3);

  // Sample size: one observation is an anecdote; five is a pattern.
  const sampleSizeFactor = clamp01(cluster.occurrenceCount / 5);

  // Agreement with the deterministic candidate engine, when it had an opinion.
  const candidateAgreement =
    cluster.existingMerchantCandidate && result.merchantCandidate
      ? cluster.existingMerchantCandidate.toUpperCase().trim() ===
        result.merchantCandidate.toUpperCase().trim()
        ? 1
        : 0
      : 0.5; // No candidate to compare against: neutral.

  // A recurring cadence with a stable amount corroborates a bill/subscription
  // claim. Amounts are signed (outflows negative), so compare magnitudes.
  const abs = (value: bigint) => (value < 0n ? -value : value);
  const a = abs(BigInt(cluster.minAmountMinor));
  const b = abs(BigInt(cluster.maxAmountMinor));
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  const median = abs(BigInt(cluster.medianAmountMinor));
  const spread = median > 0n ? Number(((hi - lo) * 100n) / median) : 100;
  const recurrenceConsistency =
    cluster.medianIntervalDays != null && spread <= 20 ? 1 : cluster.medianIntervalDays != null ? 0.6 : 0.4;

  /*
   * Weights sum to 1. The model's opinion is 40 %; local evidence is the
   * other 60 %, dominated by whether the merchant is actually in the text.
   */
  const combined = clamp01(
    modelConfidence * 0.4 +
      merchantTokenEvidence * 0.25 +
      descriptionQuality * 0.1 +
      sampleSizeFactor * 0.1 +
      candidateAgreement * 0.05 +
      recurrenceConsistency * 0.1,
  );

  return {
    combined: Math.round(combined * 10_000) / 10_000,
    modelConfidence,
    merchantTokenEvidence,
    descriptionQuality,
    sampleSizeFactor,
    candidateAgreement,
    recurrenceConsistency,
  };
}
