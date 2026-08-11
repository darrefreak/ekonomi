/**
 * Deterministic redaction of bank-description text before it may leave the
 * system (§9).
 *
 * The LLM is never asked to redact its own input: everything here is a plain
 * regular expression running locally, and the output is what the privacy
 * document (docs/intelligence/AI_TRANSACTION_PRIVACY.md) says leaves the
 * machine. The goal is to strip identifiers without destroying the merchant
 * words the classifier actually needs — "NETFLIX.COM 4501****1234" must come
 * out as "NETFLIX.COM [KORT]", not as "[REDACTED]".
 */

/** Swedish personnummer: 6 or 8 digit date, optional separator, 4 digits. */
const PERSONNUMMER = /\b(?:19|20)?\d{6}[-+]?\d{4}\b/g;

/** Card fragments: 4+ digits with masking stars around them, or 16-digit runs. */
const CARD_MASKED = /\b\d{4,6}\*{2,}\d{2,4}\b|\b(?:\d[ -]?){13,19}\b/g;

/** Swedish account / bankgiro / plusgiro shapes: digit groups with dashes. */
const ACCOUNT_NUMBER = /\b\d{3,5}[- ]\d{4,10}\b|\b\d{7,8}-\d\b/g;

/** Phone numbers: +46 or 0-prefixed digit runs with optional separators. */
const PHONE = /(?:\+46|0)[ -]?\d(?:[ -]?\d){6,9}\b/g;

/** IBAN-style references. */
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;

/**
 * Long numeric/alphanumeric payment references: 7+ characters that are mostly
 * digits. Shorter digit runs (store numbers, "7-ELEVEN") survive.
 */
const LONG_REFERENCE = /\b(?=[A-Z0-9]*\d)(?:[A-Z]?\d[A-Z0-9]{6,})\b/gi;

/** OCR/reference prefixes commonly emitted by Swedish banks. */
const TECHNICAL_REFERENCE =
  /\b(?:OCR|REF|FAKTNR|FAKTURANR|KUNDNR|AVINR|MEDDELANDE)[.: ]?\s*[A-Z0-9-]{4,}\b/gi;

export type RedactionResult = {
  text: string;
  /** Which classes of identifier were removed, for observability. */
  redacted: string[];
};

/**
 * Redact one description. Deterministic: same input, same output, no model.
 */
export function redactDescription(raw: string): RedactionResult {
  const redacted = new Set<string>();
  let text = raw;

  const apply = (pattern: RegExp, replacement: string, label: string) => {
    if (pattern.test(text)) {
      redacted.add(label);
      text = text.replace(pattern, replacement);
    }
    pattern.lastIndex = 0;
  };

  // Order matters: the most specific identifier shapes go first so that the
  // generic long-reference rule does not eat a personnummer's label.
  apply(PERSONNUMMER, "[PNR]", "personnummer");
  apply(IBAN, "[IBAN]", "iban");
  apply(CARD_MASKED, "[KORT]", "card");
  apply(ACCOUNT_NUMBER, "[KONTO]", "account");
  apply(PHONE, "[Tel]", "phone");
  apply(TECHNICAL_REFERENCE, "[REF]", "technical-reference");
  apply(LONG_REFERENCE, "[REF]", "long-reference");

  return {
    text: text.replace(/\s{2,}/g, " ").trim(),
    redacted: [...redacted],
  };
}

/**
 * Does the redacted text still carry enough semantic signal to be worth
 * asking about? (§7: opaque numeric/reference-only clusters are not sent.)
 *
 * "Enough" means at least one alphabetic token of three letters or more that
 * is not itself a redaction placeholder.
 */
export function hasSemanticText(redactedText: string): boolean {
  const withoutPlaceholders = redactedText.replace(/\[[A-ZÅÄÖa-z]+\]/g, " ");
  return /[A-Za-zÅÄÖåäö]{3,}/.test(withoutPlaceholders);
}
