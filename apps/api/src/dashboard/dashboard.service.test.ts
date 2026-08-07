import assert from "node:assert/strict";
import { test } from "node:test";
import { moneyFromJson } from "@ffos/domain";
import { calculateNetWorth } from "@ffos/financial-engine";

test("net worth composition uses financial-engine", () => {
  const netWorth = calculateNetWorth({
    cash: moneyFromJson({ amountMinor: "28400000", currency: "SEK" }),
    investments: moneyFromJson({ amountMinor: "118000000", currency: "SEK" }),
    assets: moneyFromJson({ amountMinor: "730000000", currency: "SEK" }),
    liabilities: moneyFromJson({ amountMinor: "394256100", currency: "SEK" }),
  });
  assert.equal(netWorth.amountMinor, 482143900n);
});
