import { normalizeMerchantText } from "../merchants/normalize";

/**
 * Deterministic grouping of bank descriptions.
 *
 * `APPLE COM/BI/26-08-08`, `APPLE COM/BI/26-07-08` and `APPLE COM/BI/26-06-08` are
 * one recurring charge wearing three dates. A signature is what remains when the
 * parts that change every month are removed, so those three collapse to one group
 * and can be classified once instead of three times — which is also what keeps AI
 * usage proportional to merchants rather than to transactions (§7).
 *
 * The original `rawDescription` is never touched. This produces a derived key; it
 * does not replace anything.
 */

/**
 * Fragments that vary per occurrence and carry no identity.
 *
 * Ordered: dates before bare numbers, so `26-08-08` is removed as a date rather
 * than left as three number fragments.
 */
const VOLATILE_PATTERNS: Array<{ pattern: RegExp; token: string }> = [
  // Dates in the shapes Swedish banks emit: 26-08-08, 2026-08-08, 08/08, 26.08.08
  { pattern: /\b\d{2,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/g, token: "" },
  // A bare day/month pair, e.g. "08/08" already covered, but "0808" appears too.
  { pattern: /\b\d{6,8}\b/g, token: "" },
  // Card and reference tails: /1234, *1234, nr 1234
  { pattern: /\b(?:nr|ref|kvitto|verifikat)\.?\s*\d+\b/gi, token: "" },
  // Any remaining run of 3+ digits: receipt numbers, store numbers, amounts.
  { pattern: /\b\d{3,}\b/g, token: "" },
];

/** Words that describe the payment mechanism, not who was paid. */
const MECHANISM_WORDS = new Set([
  "KORTKOP",
  "KORTKÖP",
  "AUTOGIRO",
  "AUTOPAY",
  "BETALNING",
  "OVERFORING",
  "ÖVERFÖRING",
  "SWISH",
  "BG",
  "PG",
  "BANKGIRO",
  "PLUSGIRO",
  "INBETALNING",
  "UTBETALNING",
  "DIREKT",
  "WEB",
  "INTERNET",
]);

export type TransactionSignature = {
  /** Stable grouping key. Same charge across months produces the same value. */
  key: string;
  /** Human-readable form of the key, for showing why things grouped. */
  label: string;
  /** Tokens that survived, useful for clustering and for explaining a match. */
  tokens: string[];
  /** True when nothing identifying survived — a pure reference number. */
  opaque: boolean;
};

/**
 * Build a signature from a raw bank description.
 *
 * Reuses `normalizeMerchantText` for the shared work (case folding, legal suffix
 * removal, whitespace) so signatures and merchant matching cannot drift apart,
 * then removes the per-occurrence fragments that normalization deliberately keeps.
 */
export function transactionSignature(rawDescription: string): TransactionSignature {
  const normalized = normalizeMerchantText(rawDescription ?? "");
  let text = normalized.normalizedText;

  for (const { pattern, token } of VOLATILE_PATTERNS) {
    text = text.replace(pattern, token);
  }

  const tokens = text
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1)
    .filter((token) => !MECHANISM_WORDS.has(token))
    // A single stray letter left by stripping a date carries nothing.
    .filter((token) => !/^\d+$/.test(token));

  const label = tokens.join(" ");
  const opaque = tokens.length === 0;
  /*
   * An opaque description keys on its own normalized text, not on the empty
   * label. Keying every reference number as "sig:" collapsed them all into one
   * cluster — thousands of unrelated transfers presented as a single merchant, and
   * a single classification would then have been applied to all of them.
   *
   * Identical raw text still groups; different references do not.
   */
  return {
    // Prefixed so a signature can never be mistaken for a merchant id or alias.
    key: opaque ? `sig:opaque:${normalized.normalizedText.trim()}` : `sig:${label}`,
    label,
    tokens,
    opaque,
  };
}

/**
 * Group transactions by signature.
 *
 * Returns groups ordered by size, because the largest groups are where both
 * classification effort and AI cost are worth spending first.
 */
export function groupBySignature<T extends { rawDescription: string }>(
  transactions: readonly T[],
): Array<{ signature: TransactionSignature; transactions: T[] }> {
  const groups = new Map<string, { signature: TransactionSignature; transactions: T[] }>();
  for (const transaction of transactions) {
    const signature = transactionSignature(transaction.rawDescription);
    const existing = groups.get(signature.key);
    if (existing) existing.transactions.push(transaction);
    else groups.set(signature.key, { signature, transactions: [transaction] });
  }
  return [...groups.values()].sort(
    (a, b) => b.transactions.length - a.transactions.length,
  );
}

/**
 * Do two signatures describe the same thing?
 *
 * Conservative on purpose (§4): equality, or one token set fully containing the
 * other with at least two shared tokens. `ICA MAXI HANINGE` and `ICA MAXI HANI`
 * do *not* match under this rule — a truncated store name is not evidence enough,
 * and a wrongly merged merchant is worse than an unknown one.
 */
export function signaturesLikelySame(
  a: TransactionSignature,
  b: TransactionSignature,
): boolean {
  // Checked before key equality: two opaque descriptions carry no identifying
  // token, so they are never evidence of the same merchant even when the digits
  // happen to match.
  if (a.opaque || b.opaque) return false;
  if (a.key === b.key) return true;
  const setA = new Set(a.tokens);
  const setB = new Set(b.tokens);
  const shared = [...setA].filter((token) => setB.has(token));
  /*
   * Two shared tokens minimum, which also rules out single-token containment.
   * Allowing it would make "ICA" match both "ICA MAXI HANINGE" and "ICA KVANTUM
   * SOLNA", merging two different shops on the strength of a chain name — exactly
   * the false merge §4 says is worse than an unknown.
   */
  if (shared.length < 2) return false;
  return shared.length === setA.size || shared.length === setB.size;
}
