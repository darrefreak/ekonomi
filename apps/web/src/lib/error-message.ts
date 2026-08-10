/**
 * Turns whatever a request threw into something a Swedish-speaking household
 * can act on.
 *
 * The API answers in English — "Account not found", "Invalid credentials",
 * "Cannot demote the last OWNER" — and the web app rendered `err.message`
 * directly in 52 places, so those strings appeared verbatim inside an otherwise
 * Swedish product. Backend wording is also not something a participant should
 * ever have to interpret.
 *
 * The rule: a message the product wrote itself is shown as-is, a known API
 * message is translated, and anything else becomes the caller's fallback. That
 * keeps the useful specifics without leaking internals.
 */

/** Known API and domain messages, in the order they should be tried. */
const TRANSLATIONS: Array<[RegExp, string]> = [
  [/invalid credentials|unauthorized/i, "Fel e-post eller lösenord."],
  [/forbidden|not permitted|insufficient role/i, "Du har inte behörighet till det här."],
  [/cannot demote the last owner/i, "Hushållet måste ha minst en ägare."],
  [/account not found/i, "Kontot hittades inte."],
  [/category not found/i, "Kategorin hittades inte."],
  [/budget line not found/i, "Budgetposten hittades inte."],
  [/document not found/i, "Dokumentet hittades inte."],
  [/debt account not found/i, "Skuldkontot hittades inte."],
  [/candidate not found/i, "Kandidaten hittades inte."],
  [/anomaly not found/i, "Avvikelsen hittades inte."],
  [/vehicle not found/i, "Fordonet hittades inte."],
  [/goal not found/i, "Målet hittades inte."],
  [/transaction not found/i, "Transaktionen hittades inte."],
  [/household not found/i, "Hushållet hittades inte."],
  [/not found|404/i, "Det gick inte att hitta det du bad om."],
  [/demo reseed disabled/i, "Demodata är avstängt i den här installationen."],
  [/already exists|duplicate|conflict|409/i, "Det finns redan en post med de uppgifterna."],
  [/unsupported currency|currency not supported/i, "Valutan stöds inte ännu. Hushållet räknar i SEK."],
  [/validation|invalid input|422/i, "Något i formuläret ser fel ut. Kontrollera fälten."],
  [/erasure_storage_unavailable|storage unavailable/i, "Lagringen svarar inte, så åtgärden kunde inte slutföras."],
  [/failed to fetch|networkerror|network request failed|econnrefused/i, "Kunde inte nå tjänsten. Kontrollera anslutningen och försök igen."],
  [/timeout|timed out/i, "Tjänsten svarade inte i tid. Försök igen."],
  [/rate limit|too many requests|429/i, "För många försök. Vänta en stund och försök igen."],
  [/internal server error|500|503/i, "Tjänsten hade ett internt fel. Försök igen om en stund."],
];

/** Swedish letters, or words only a Swedish string would contain. */
const LOOKS_SWEDISH = /[åäöÅÄÖ]|\b(kan|inte|måste|hushåll|konto|kunde|ingen|finns|saknas|ange|välj|belopp|redan|för)\b/i;

export function describeError(
  error: unknown,
  fallback = "Något gick fel. Försök igen.",
): string {
  const raw = (error instanceof Error ? error.message : typeof error === "string" ? error : "").trim();
  if (!raw) return fallback;

  for (const [pattern, message] of TRANSLATIONS) {
    if (pattern.test(raw)) return message;
  }

  // The product's own messages are already written for the participant.
  if (LOOKS_SWEDISH.test(raw)) return raw;

  return fallback;
}
