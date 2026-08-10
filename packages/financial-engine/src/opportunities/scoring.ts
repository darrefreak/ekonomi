import type { ConfidenceBreakdown, PriorityBreakdown } from "./types";

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function confidenceLabel(score: number): "low" | "medium" | "high" {
  if (score >= 0.7) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

/**
 * V1 confidence model — explicit weighted inputs, not arbitrary HIGH.
 * Weights: coverage 30%, freshness 25%, sample 25%, source reliability 20%.
 */
export function buildConfidence(input: {
  coverageScore: number;
  freshnessScore: number;
  sampleSizeScore: number;
  sourceReliabilityScore: number;
}): ConfidenceBreakdown {
  const coverageScore = clamp01(input.coverageScore);
  const freshnessScore = clamp01(input.freshnessScore);
  const sampleSizeScore = clamp01(input.sampleSizeScore);
  const sourceReliabilityScore = clamp01(input.sourceReliabilityScore);
  const confidenceScore = clamp01(
    coverageScore * 0.3 +
      freshnessScore * 0.25 +
      sampleSizeScore * 0.25 +
      sourceReliabilityScore * 0.2,
  );
  return {
    coverageScore,
    freshnessScore,
    sampleSizeScore,
    sourceReliabilityScore,
    confidenceScore,
    label: confidenceLabel(confidenceScore),
  };
}

/**
 * Priority = impact × confidence × ease × (1 − riskPenalty)
 * impactScore normalized vs 50k SEK/year reference (capped at 1).
 */
export function buildPriority(input: {
  annualImpactMinor: bigint | null;
  confidenceScore: number;
  effort: "low" | "medium" | "high";
  risk: "low" | "moderate" | "high";
}): PriorityBreakdown {
  const ref = 50_000_00n;
  let impactScore = 0;
  if (input.annualImpactMinor != null && input.annualImpactMinor > 0n) {
    const ratio = Number(input.annualImpactMinor) / Number(ref);
    impactScore = clamp01(ratio);
  } else {
    // Review-only (null impact): small base so deadline items still rank
    impactScore = 0.15;
  }
  const easeScore =
    input.effort === "low" ? 0.9 : input.effort === "medium" ? 0.6 : 0.35;
  const riskPenalty =
    input.risk === "low" ? 0.05 : input.risk === "moderate" ? 0.25 : 0.5;
  const confidenceScore = clamp01(input.confidenceScore);
  const priorityScore = clamp01(
    impactScore * confidenceScore * easeScore * (1 - riskPenalty),
  );
  return {
    impactScore,
    confidenceScore,
    easeScore,
    riskPenalty,
    priorityScore,
  };
}

/** Simple FNV-1a style hash for opportunity input fingerprint (decimal string). */
export function opportunityInputHash(parts: string[]): string {
  let h = 2166136261;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `opp-${(h >>> 0).toString(16).padStart(8, "0")}`;
}
