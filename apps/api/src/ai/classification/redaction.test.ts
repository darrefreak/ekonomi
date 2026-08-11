import assert from "node:assert/strict";
import { test } from "node:test";
import { hasSemanticText, redactDescription } from "./redaction";

/*
 * Redaction is the privacy boundary (§9): everything asserted here is what
 * docs/intelligence/AI_TRANSACTION_PRIVACY.md promises. These tests are the
 * regression fence around that promise.
 */

test("personnummer is masked in both 10 and 12 digit forms", () => {
  assert.equal(redactDescription("BETALNING 850101-1234").text, "BETALNING [PNR]");
  assert.equal(redactDescription("REF 19850101-1234 AVGIFT").text, "REF [PNR] AVGIFT");
  assert.ok(redactDescription("A 8501011234 B").redacted.includes("personnummer"));
});

test("card fragments are masked without destroying the merchant", () => {
  const result = redactDescription("NETFLIX.COM 4501****1234");
  assert.equal(result.text, "NETFLIX.COM [KORT]");
  assert.ok(result.redacted.includes("card"));
});

test("full card-like digit runs are masked", () => {
  assert.ok(!redactDescription("KÖP 4501 1234 5678 9010").text.includes("4501"));
});

test("account, bankgiro and plusgiro shapes are masked", () => {
  assert.equal(redactDescription("BG 5301-1234567").text, "BG [KONTO]");
  assert.ok(!redactDescription("ÖVERFÖRING 3300 1234567890").text.includes("1234567890"));
});

test("phone numbers are masked", () => {
  assert.ok(!redactDescription("SWISH +46701234567").text.includes("46701234567"));
  assert.ok(!redactDescription("TEL 070-123 45 67").text.includes("123 45 67"));
});

test("IBAN is masked", () => {
  assert.equal(redactDescription("SE3550000000054910000003").text, "[IBAN]");
});

test("OCR and long payment references are masked", () => {
  assert.equal(redactDescription("OCR 12345678901").text, "[REF]");
  assert.ok(!redactDescription("FAKTNR: 998877665 EL").text.includes("998877665"));
  // A 14-digit run masks as a card-shaped number before the generic rule —
  // the class of the mask matters less than that the digits are gone.
  assert.ok(!redactDescription("INBET 90480938947529").text.includes("9048"));
});

test("useful merchant text survives redaction", () => {
  assert.equal(redactDescription("ICA MAXI HANINGE").text, "ICA MAXI HANINGE");
  assert.equal(redactDescription("7-ELEVEN STOCKHOLM").text, "7-ELEVEN STOCKHOLM");
  assert.equal(
    redactDescription("SPOTIFY P4A2B7C9D1E3F").text,
    "SPOTIFY [REF]",
    "the reference goes, the brand stays",
  );
});

test("redaction is deterministic", () => {
  const input = "BETALNING 850101-1234 NETFLIX.COM 4501****1234 OCR 12345678901";
  assert.equal(redactDescription(input).text, redactDescription(input).text);
});

test("semantic-text check: reference-only descriptions are opaque (§7, §28)", () => {
  assert.equal(hasSemanticText(redactDescription("90480938947529").text), false);
  assert.equal(hasSemanticText(redactDescription("OCR 12345678901").text), false);
  assert.equal(hasSemanticText("[REF] [KONTO]"), false);
  assert.equal(hasSemanticText(redactDescription("NETFLIX.COM 4501****1234").text), true);
  assert.equal(hasSemanticText("ICA MAXI"), true);
});
