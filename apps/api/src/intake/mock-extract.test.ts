import assert from "node:assert/strict";
import { test } from "node:test";
import { mockExtractDocument, parseExtractAmountToken } from "./mock-extract";

test("mock extract fills invoice fields without OCR", () => {
  const result = mockExtractDocument({
    title: "Vattenfall faktura 1482.50",
    documentType: "INVOICE",
    filename: "vattenfall.pdf",
  });
  assert.equal(result.extracted.ocr, false);
  assert.equal(result.extracted.mock, true);
  assert.ok(result.issuer);
  assert.equal(result.amountMinor, 148_250n);
  assert.ok(["REVIEW", "ACTION_REQUIRED"].includes(result.status));
});

test("vehicle extract includes odometer", () => {
  const result = mockExtractDocument({
    title: "Bilia service",
    documentType: "VEHICLE",
  });
  assert.equal(result.extracted.odometerKm, 76_400);
});

test("R2-A3 — extract amounts use exact kronor parsing (no float)", () => {
  assert.equal(parseExtractAmountToken("1234,50"), 123_450n);
  assert.equal(parseExtractAmountToken("1234.50"), 123_450n);
  assert.equal(parseExtractAmountToken("0,01"), 1n);
  assert.equal(parseExtractAmountToken("12 000"), 1_200_000n);
  // Large value stays exact (would drift with Number * 100).
  assert.equal(
    parseExtractAmountToken("90071992547409.12"),
    9007199254740912n,
  );

  const doc = mockExtractDocument({
    title: "Faktura 90071992547409.12 SEK",
    documentType: "INVOICE",
  });
  assert.equal(doc.amountMinor, 9007199254740912n);
  assert.equal(doc.extracted.amountMinor, "9007199254740912");
});

test("R2-A3 — reject scientific / malformed float-like tokens", () => {
  assert.equal(parseExtractAmountToken("1e3"), null);
  assert.equal(parseExtractAmountToken("1.23e2"), null);
  assert.equal(parseExtractAmountToken("1.234"), null); // >2 dp
  assert.equal(parseExtractAmountToken("abc"), null);
  assert.equal(parseExtractAmountToken(""), null);

  // Scientific token in title must not produce a float-rounded amount.
  const sci = mockExtractDocument({
    title: "Belopp 1.23e2 kronor",
    documentType: "OTHER",
  });
  assert.equal(sci.amountMinor, null);
});
