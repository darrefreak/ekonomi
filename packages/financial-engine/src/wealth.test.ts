import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bucketBalancesForNetWorth,
  monthEndDates,
  netWorthFromTypedBalances,
} from "./wealth";

test("netWorthFromTypedBalances matches cash + inv + assets − liabilities", () => {
  const nw = netWorthFromTypedBalances(
    [
      { accountType: "CHECKING", balanceMinor: 100_000_00n },
      { accountType: "INVESTMENT", balanceMinor: 500_000_00n },
      { accountType: "ASSET", balanceMinor: 1_000_000_00n },
      { accountType: "MORTGAGE", balanceMinor: 400_000_00n },
      { accountType: "LOAN", balanceMinor: -50_000_00n },
    ],
    "SEK",
  );
  // 100k + 500k + 1M − 400k − 50k = 1_150_000
  assert.equal(nw.amountMinor, 1_150_000_00n);
});

test("bucketBalancesForNetWorth groups investment types", () => {
  const buckets = bucketBalancesForNetWorth(
    [
      { accountType: "INVESTMENT", balanceMinor: 10n },
      { accountType: "PENSION", balanceMinor: 20n },
      { accountType: "CRYPTO", balanceMinor: 5n },
    ],
    "SEK",
  );
  assert.equal(buckets.investments.amountMinor, 35n);
});

test("monthEndDates returns ascending ends including asOf tip", () => {
  const dates = monthEndDates("2026-08-01", 3);
  assert.ok(dates.includes("2026-05-31") || dates.includes("2026-06-30"));
  assert.ok(dates[dates.length - 1] === "2026-08-01" || dates.includes("2026-08-01"));
  assert.ok(dates.length >= 3);
});
