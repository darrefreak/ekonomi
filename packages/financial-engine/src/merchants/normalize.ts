/**
 * Deterministic V1 merchant normalization.
 * False merges are worse than leaving unknown — no aggressive fuzzy merge.
 */

export type NormalizeStage =
  | "casing"
  | "whitespace"
  | "noise"
  | "legal_suffix"
  | "tokenize"
  | "exact_alias"
  | "canonical_alias"
  | "high_confidence_rule";

export type MerchantRecord = {
  id: string;
  canonicalName: string;
  aliases: string[];
  normalizedTokens?: string[];
  confidence?: number;
  userVerified?: boolean;
};

export type NormalizeResult = {
  rawDescription: string;
  normalizedText: string;
  tokens: string[];
  match: {
    merchantId: string;
    canonicalName: string;
    confidence: number;
    stage: NormalizeStage;
  } | null;
  needsReview: boolean;
  stagesApplied: NormalizeStage[];
};

const NOISE_PATTERNS: RegExp[] = [
  /\b\d{3,}\b/g, // long numeric store codes
  /\bpos\b/gi,
  /\bautopay\b/gi,
  /\bkontaktlos\b/gi,
  /\bcontactless\b/gi,
  /\bcard\s*\d{2,4}\b/gi,
  /\s{2,}/g,
];

const LEGAL_SUFFIXES = [
  /\bab\b/gi,
  /\baktiebolag\b/gi,
  /\bsverige\b/gi,
  /\bsweden\b/gi,
  /\bgroup\b/gi,
  /\bholding\b/gi,
];

export function normalizeMerchantText(raw: string): {
  normalizedText: string;
  tokens: string[];
  stagesApplied: NormalizeStage[];
} {
  const stages: NormalizeStage[] = [];
  let text = raw ?? "";
  text = text.normalize("NFKC");
  stages.push("casing");
  text = text.toUpperCase();
  stages.push("whitespace");
  text = text.replace(/\s+/g, " ").trim();
  stages.push("noise");
  for (const re of NOISE_PATTERNS) {
    text = text.replace(re, " ");
  }
  text = text.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  stages.push("legal_suffix");
  for (const re of LEGAL_SUFFIXES) {
    text = text.replace(re, " ");
  }
  text = text.replace(/\s+/g, " ").trim();
  stages.push("tokenize");
  const tokens = text.split(" ").filter(Boolean);
  return { normalizedText: text, tokens, stagesApplied: stages };
}

function aliasKey(s: string): string {
  return normalizeMerchantText(s).normalizedText;
}

/**
 * Match raw description to merchants. Exact alias / canonical only.
 * Never merges on partial token overlap alone.
 */
export function matchMerchant(
  rawDescription: string,
  merchants: MerchantRecord[],
): NormalizeResult {
  const { normalizedText, tokens, stagesApplied } =
    normalizeMerchantText(rawDescription);
  const rawKey = aliasKey(rawDescription);

  // Exact alias match (highest trust for user-verified aliases)
  for (const m of merchants) {
    for (const alias of m.aliases ?? []) {
      if (aliasKey(alias) === rawKey) {
        const confidence = m.userVerified ? 0.98 : 0.92;
        return {
          rawDescription,
          normalizedText,
          tokens,
          match: {
            merchantId: m.id,
            canonicalName: m.canonicalName,
            confidence,
            stage: "exact_alias",
          },
          needsReview: confidence < 0.85,
          stagesApplied: [...stagesApplied, "exact_alias"],
        };
      }
    }
  }

  // Canonical name exact
  for (const m of merchants) {
    if (aliasKey(m.canonicalName) === rawKey) {
      return {
        rawDescription,
        normalizedText,
        tokens,
        match: {
          merchantId: m.id,
          canonicalName: m.canonicalName,
          confidence: 0.95,
          stage: "canonical_alias",
        },
        needsReview: false,
        stagesApplied: [...stagesApplied, "canonical_alias"],
      };
    }
  }

  // High-confidence rule: normalized text equals normalized canonical
  // or alias after noise stripping (already covered). Additional rule:
  // if tokens equal canonical tokens exactly.
  for (const m of merchants) {
    const canonTokens = normalizeMerchantText(m.canonicalName).tokens;
    if (
      canonTokens.length >= 2 &&
      canonTokens.length === tokens.length &&
      canonTokens.every((t, i) => t === tokens[i])
    ) {
      return {
        rawDescription,
        normalizedText,
        tokens,
        match: {
          merchantId: m.id,
          canonicalName: m.canonicalName,
          confidence: 0.88,
          stage: "high_confidence_rule",
        },
        needsReview: false,
        stagesApplied: [...stagesApplied, "high_confidence_rule"],
      };
    }
  }

  // Do NOT fuzzy-merge. Leave unmatched → needs review if looks like a merchant string.
  const looksMerchant = tokens.length >= 1 && normalizedText.length >= 3;
  return {
    rawDescription,
    normalizedText,
    tokens,
    match: null,
    needsReview: looksMerchant,
    stagesApplied,
  };
}

/** Suggest alias string to store from a raw description (noise-stripped). */
export function suggestAliasFromRaw(rawDescription: string): string {
  return normalizeMerchantText(rawDescription).normalizedText;
}
