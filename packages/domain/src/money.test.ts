import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addMoney,
  kronorStringToMinor,
  minorToKronorString,
  money,
  moneyFromJson,
  moneyToJson,
  subMoney,
} from "./money";

test("money roundtrips through JSON strings", () => {
  const value = money(123450n, "SEK");
  const json = moneyToJson(value);
  assert.equal(json.amountMinor, "123450");
  assert.deepEqual(moneyFromJson(json), value);
});

test("add and subtract preserve currency", () => {
  const a = money(100_000_00n, "SEK");
  const b = money(20_000_00n, "SEK");
  assert.equal(subMoney(a, b).amountMinor, 80_000_00n);
  assert.equal(addMoney(b, b).amountMinor, 40_000_00n);
});

test("kronorStringToMinor uses integer öre parsing (no float)", () => {
  assert.equal(kronorStringToMinor("1234,50"), 123_450n);
  assert.equal(kronorStringToMinor("1234.5"), 123_450n);
  assert.equal(kronorStringToMinor("0,01"), 1n);
  assert.equal(kronorStringToMinor("-20"), -2_000n);
  assert.equal(kronorStringToMinor(" 12 000 "), 1_200_000n);
  assert.equal(kronorStringToMinor("1.234"), null); // >2 decimal digits
  assert.equal(kronorStringToMinor("abc"), null);
  // Large values stay exact (would drift with Number * 100).
  assert.equal(kronorStringToMinor("90071992547409.12"), 9007199254740912n);
});

test("minorToKronorString formats without float", () => {
  assert.equal(minorToKronorString(123_450n), "1234.50");
  assert.equal(minorToKronorString(100_00n), "100");
  assert.equal(minorToKronorString(-50n), "-0.50");
  assert.equal(minorToKronorString("200"), "2");
});
