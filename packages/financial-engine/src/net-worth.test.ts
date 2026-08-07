import assert from "node:assert/strict";
import { test } from "node:test";
import { money } from "@ffos/domain";
import { calculateNetWorth } from "./net-worth";

test("net worth = cash + investments + assets - liabilities", () => {
  const result = calculateNetWorth({
    cash: money(284_000_00n, "SEK"),
    investments: money(1_180_000_00n, "SEK"),
    assets: money(7_300_000_00n, "SEK"),
    liabilities: money(3_942_561_00n, "SEK"),
  });
  assert.equal(result.amountMinor, 4_821_439_00n);
});
