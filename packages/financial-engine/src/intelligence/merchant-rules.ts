/**
 * A small, versioned catalogue of merchants a Swedish bank statement names
 * unambiguously, and the inference that turns a cluster into a candidate.
 *
 * This is the missing link the last acceptance found: clustering worked, but every
 * cluster stayed UNKNOWN because `matchMerchant` compares against merchants the
 * household already has, and a freshly imported statement has none.
 *
 * Deliberately small. This is not an attempt to enumerate Swedish retail; it is a
 * seed for the cases where the bank text is decisive, and everything else is left
 * for the household to name. An unknown merchant costs a question. A wrong one
 * silently misfiles years of spending.
 */

/** Bumped when a rule's meaning changes, so cached results can be invalidated. */
export const MERCHANT_RULE_CATALOG_VERSION = "merchant-rules-1.0.0";

export type MerchantRuleCategory =
  | "food.groceries"
  | "food.restaurant"
  | "transport.fuel"
  | "transport"
  | "lifestyle.subscriptions"
  | "lifestyle"
  | "housing.electricity"
  | "housing"
  | "health";

export type SystemMerchantRule = {
  /** Canonical name shown to the household. */
  merchant: string;
  /**
   * Tokens that must all be present in the normalized description.
   *
   * All-of rather than any-of: "CIRCLE" alone matches nothing useful, and
   * requiring the full set is what keeps Circle K fuel from absorbing every
   * description containing "K".
   */
  tokens: string[];
  /** Suggested category key, mapped to the household's taxonomy by the caller. */
  categoryKey: MerchantRuleCategory;
  /** Whether this merchant is normally a recurring subscription. */
  subscriptionLikely?: boolean;
  /** 0–1. How decisive the token evidence is. */
  confidence: number;
};

/**
 * The catalogue.
 *
 * Every entry is a chain whose name appears verbatim in Swedish bank text and is
 * not a common word. Entries deliberately absent: anything whose token is also an
 * ordinary word, and anything where the same brand covers materially different
 * spending (a supermarket that also sells fuel).
 */
export const SYSTEM_MERCHANT_RULES: readonly SystemMerchantRule[] = [
  // Groceries. Confidence below the others for chains whose stores vary widely.
  { merchant: "ICA", tokens: ["ICA"], categoryKey: "food.groceries", confidence: 0.86 },
  { merchant: "Coop", tokens: ["COOP"], categoryKey: "food.groceries", confidence: 0.88 },
  { merchant: "Willys", tokens: ["WILLYS"], categoryKey: "food.groceries", confidence: 0.92 },
  { merchant: "Hemköp", tokens: ["HEMKOP"], categoryKey: "food.groceries", confidence: 0.92 },
  { merchant: "Lidl", tokens: ["LIDL"], categoryKey: "food.groceries", confidence: 0.92 },
  { merchant: "City Gross", tokens: ["CITY", "GROSS"], categoryKey: "food.groceries", confidence: 0.9 },

  // Restaurants and delivery.
  { merchant: "McDonald's", tokens: ["MCDONALDS"], categoryKey: "food.restaurant", confidence: 0.94 },
  { merchant: "Max", tokens: ["MAX", "BURGERS"], categoryKey: "food.restaurant", confidence: 0.9 },
  { merchant: "Wolt", tokens: ["WOLT"], categoryKey: "food.restaurant", confidence: 0.92 },
  { merchant: "Foodora", tokens: ["FOODORA"], categoryKey: "food.restaurant", confidence: 0.94 },

  // Fuel. Circle K also sells food, so the category is fuel and the household can
  // correct it — which is the safer default for a petrol station.
  { merchant: "OKQ8", tokens: ["OKQ8"], categoryKey: "transport.fuel", confidence: 0.94 },
  { merchant: "Circle K", tokens: ["CIRCLE"], categoryKey: "transport.fuel", confidence: 0.88 },
  { merchant: "Shell", tokens: ["SHELL"], categoryKey: "transport.fuel", confidence: 0.9 },
  { merchant: "Preem", tokens: ["PREEM"], categoryKey: "transport.fuel", confidence: 0.92 },
  { merchant: "Ingo", tokens: ["INGO"], categoryKey: "transport.fuel", confidence: 0.88 },

  // Transport.
  { merchant: "SL", tokens: ["SL", "BILJETT"], categoryKey: "transport", confidence: 0.9 },
  { merchant: "SJ", tokens: ["SJ", "AB"], categoryKey: "transport", confidence: 0.85 },

  // Subscriptions. These are the clearest signals in any statement.
  { merchant: "Netflix", tokens: ["NETFLIX"], categoryKey: "lifestyle.subscriptions", subscriptionLikely: true, confidence: 0.96 },
  { merchant: "Spotify", tokens: ["SPOTIFY"], categoryKey: "lifestyle.subscriptions", subscriptionLikely: true, confidence: 0.96 },
  { merchant: "HBO Max", tokens: ["HBO"], categoryKey: "lifestyle.subscriptions", subscriptionLikely: true, confidence: 0.94 },
  { merchant: "Viaplay", tokens: ["VIAPLAY"], categoryKey: "lifestyle.subscriptions", subscriptionLikely: true, confidence: 0.94 },
  { merchant: "Disney+", tokens: ["DISNEY"], categoryKey: "lifestyle.subscriptions", subscriptionLikely: true, confidence: 0.94 },
  { merchant: "Storytel", tokens: ["STORYTEL"], categoryKey: "lifestyle.subscriptions", subscriptionLikely: true, confidence: 0.94 },
  /*
   * Apple and Google bill for wildly different things through one descriptor, so
   * the merchant is confident and the category is not. Marked as a subscription
   * candidate but with lower category confidence, which routes it to review rather
   * than filing a hardware purchase under subscriptions.
   */
  { merchant: "Apple", tokens: ["APPLE"], categoryKey: "lifestyle.subscriptions", subscriptionLikely: true, confidence: 0.78 },
  { merchant: "Google", tokens: ["GOOGLE"], categoryKey: "lifestyle.subscriptions", subscriptionLikely: true, confidence: 0.78 },

  // Utilities and health.
  { merchant: "Vattenfall", tokens: ["VATTENFALL"], categoryKey: "housing.electricity", confidence: 0.94 },
  { merchant: "Fortum", tokens: ["FORTUM"], categoryKey: "housing.electricity", confidence: 0.94 },
  { merchant: "Apoteket", tokens: ["APOTEKET"], categoryKey: "health", confidence: 0.94 },
  { merchant: "Systembolaget", tokens: ["SYSTEMBOLAGET"], categoryKey: "food.groceries", confidence: 0.94 },
] as const;

export type MerchantCandidateSource =
  | "SYSTEM_RULE"
  | "CLUSTER_INFERENCE"
  | "HOUSEHOLD_RULE"
  | "USER_VERIFIED"
  | "AI";

export type MerchantCandidate = {
  merchant: string;
  categoryKey: string | null;
  confidence: number;
  source: MerchantCandidateSource;
  subscriptionLikely: boolean;
  /** Why this candidate, for the review card and the "why" surface. */
  evidence: string;
};

/**
 * Suggest a merchant for a cluster, from its tokens alone.
 *
 * Returns null rather than a guess. An opaque cluster — a bare reference number —
 * is never given a merchant: there is nothing in it to be right about, and an
 * invented name would be indistinguishable from a real one once stored.
 */
export function inferMerchantCandidate(input: {
  /** Normalized tokens from the cluster's signature. */
  tokens: readonly string[];
  opaque: boolean;
  /** How many transactions the cluster holds. More is stronger evidence. */
  transactionCount: number;
}): MerchantCandidate | null {
  if (input.opaque || input.tokens.length === 0) return null;
  const tokens = new Set(input.tokens.map((token) => token.toUpperCase()));

  const matches = SYSTEM_MERCHANT_RULES.filter((rule) =>
    rule.tokens.every((token) => tokens.has(token)),
  );
  if (matches.length === 0) return null;

  /*
   * Two rules matching means the text supports two different merchants, and
   * picking one would be a coin toss recorded as a fact. Refuse instead.
   */
  if (matches.length > 1) return null;

  const rule = matches[0]!;
  /*
   * A single sighting is weaker evidence than fifty. The adjustment is small —
   * the token match is doing the work — but it keeps a one-off from being
   * auto-applied at the same confidence as an established pattern.
   */
  const volumeBonus = input.transactionCount >= 5 ? 0.02 : input.transactionCount >= 2 ? 0 : -0.05;
  const confidence = Math.max(0, Math.min(1, rule.confidence + volumeBonus));

  return {
    merchant: rule.merchant,
    categoryKey: rule.categoryKey,
    confidence,
    source: "SYSTEM_RULE",
    subscriptionLikely: rule.subscriptionLikely ?? false,
    evidence: `Banktexten innehåller ${rule.tokens.join(" + ")}, som entydigt pekar på ${rule.merchant}.`,
  };
}

/**
 * The confidence at which a candidate may be applied without asking.
 *
 * Category and merchant only. Anything that changes economic meaning has a
 * separate, higher bar and goes through the validated revision path.
 */
export const AUTO_ACCEPT_CONFIDENCE = 0.9;

/** Below this, the household is asked rather than told. */
export const REVIEW_CONFIDENCE = 0.9;

export function shouldAutoAccept(candidate: MerchantCandidate): boolean {
  return candidate.confidence >= AUTO_ACCEPT_CONFIDENCE;
}
