import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeError } from "./error-message";

/**
 * The audit found 52 places rendering `err.message` straight into the page while
 * the API answers in English. These are the strings it actually returns.
 */
describe("describeError", () => {
  it("translates the API's English messages", () => {
    assert.equal(
      describeError(new Error("Invalid credentials")),
      "Fel e-post eller lösenord.",
    );
    assert.equal(describeError(new Error("Account not found")), "Kontot hittades inte.");
    assert.equal(
      describeError(new Error("Cannot demote the last OWNER")),
      "Hushållet måste ha minst en ägare.",
    );
    assert.equal(
      describeError(new Error("Budget line not found")),
      "Budgetposten hittades inte.",
    );
  });

  it("never leaks an untranslated English message", () => {
    const leaked = describeError(new Error("Unexpected token in JSON at position 4"));
    assert.equal(leaked, "Något gick fel. Försök igen.");
    assert.ok(!/JSON|token|position/i.test(leaked));
  });

  it("keeps the caller's own wording as the fallback", () => {
    assert.equal(
      describeError(new Error("EntityMetadataNotFoundError"), "Kunde inte spara budgeten."),
      "Kunde inte spara budgeten.",
    );
  });

  it("passes through a message the product wrote itself", () => {
    assert.equal(
      describeError(new Error("Inget hushåll kopplat till kontot")),
      "Inget hushåll kopplat till kontot",
    );
    assert.equal(
      describeError(new Error("Ange ett kontonamn.")),
      "Ange ett kontonamn.",
    );
  });

  it("explains a network failure as a network failure", () => {
    assert.match(describeError(new TypeError("Failed to fetch")), /kunde inte nå tjänsten/i);
  });

  it("handles a thrown non-error without crashing", () => {
    assert.equal(describeError(undefined), "Något gick fel. Försök igen.");
    assert.equal(describeError(null, "Kunde inte hämta."), "Kunde inte hämta.");
    assert.equal(describeError("Kontot hittades inte."), "Kontot hittades inte.");
  });
});
