import assert from "node:assert/strict";
import { test } from "node:test";
import { keepVsReplace, sellWindowHint } from "./market";

test("keep vs replace prefers clear savings", () => {
  const r = keepVsReplace({
    currentMonthlyEconomicMinor: 6_000_00n,
    candidateMonthlyEconomicMinor: 4_000_00n,
    switchingCostMinor: 12_000_00n,
  });
  assert.equal(r.recommendation, "replace");
});

test("sell window waits on negative equity", () => {
  const h = sellWindowHint(-20_000_00n, 3);
  assert.equal(h.status, "WAIT");
});
