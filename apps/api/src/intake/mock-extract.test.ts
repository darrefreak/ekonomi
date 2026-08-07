import assert from "node:assert/strict";
import { test } from "node:test";
import { mockExtractDocument } from "./mock-extract";

test("mock extract fills invoice fields without OCR", () => {
  const result = mockExtractDocument({
    title: "Vattenfall faktura 1482.50",
    documentType: "INVOICE",
    filename: "vattenfall.pdf",
  });
  assert.equal(result.extracted.ocr, false);
  assert.equal(result.extracted.mock, true);
  assert.ok(result.issuer);
  assert.ok(result.amountMinor != null && result.amountMinor > 0n);
  assert.ok(["REVIEW", "ACTION_REQUIRED"].includes(result.status));
});

test("vehicle extract includes odometer", () => {
  const result = mockExtractDocument({
    title: "Bilia service",
    documentType: "VEHICLE",
  });
  assert.equal(result.extracted.odometerKm, 76_400);
});
