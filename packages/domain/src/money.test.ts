import assert from "node:assert/strict";
import { test } from "node:test";
import { addMoney, money, moneyFromJson, moneyToJson, subMoney } from "./money";

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
