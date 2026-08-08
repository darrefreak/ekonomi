import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateAvailableToInvest } from "./available-to-invest";

test("available_to_invest floors at zero and documents assumptions", () => {
  const tight = calculateAvailableToInvest({
    availableCashMinor: 10_000_00n,
    minimumCashBalanceMinor: 6_000_00n,
    emergencyFundTargetMinor: 12_000_00n,
    safetyMarginMinor: 2_000_00n,
    reservedSinkingFundMinor: 1_000_00n,
    upcoming30dOutflowMinor: 3_000_00n,
  });
  assert.equal(tight.availableToInvestMinor, 0n);
  assert.ok(tight.assumptions.length >= 2);

  const surplus = calculateAvailableToInvest({
    availableCashMinor: 100_000_00n,
    minimumCashBalanceMinor: 6_000_00n,
    emergencyFundTargetMinor: 12_000_00n,
    safetyMarginMinor: 2_000_00n,
    reservedSinkingFundMinor: 5_000_00n,
    upcoming30dOutflowMinor: 4_000_00n,
  });
  // 100k − 6 − 12 − 2 − 5 − 4 = 71k
  assert.equal(surplus.availableToInvestMinor, 71_000_00n);
  assert.equal(surplus.deductions.totalDeductedMinor, 29_000_00n);
});
