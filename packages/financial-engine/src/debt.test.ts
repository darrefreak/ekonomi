import assert from "node:assert/strict";
import { test } from "node:test";
import {
  monthlyInterestFromRateMinor,
  mortgageRateScenarioMonthlyDeltaMinor,
  outstandingLiabilityMinor,
  summarizePrincipalInterest,
} from "./debt";

test("outstandingLiabilityMinor reports what is owed, clamped at zero", () => {
  assert.equal(outstandingLiabilityMinor(100_00n), 100_00n);
  // A credit balance means the lender owes the household. Nothing is owed, so
  // nothing is reported as debt. Taking the magnitude here was RT2-001.
  assert.equal(outstandingLiabilityMinor(-195_000_00n), 0n);
  assert.equal(outstandingLiabilityMinor(0n), 0n);
});

test("no interest accrues on a liability holding a credit balance", () => {
  const principal = outstandingLiabilityMinor(-20_000_00n);
  assert.equal(monthlyInterestFromRateMinor(principal, 240), 0n);
});

test("monthlyInterestFromRateMinor is principal × rate / 12", () => {
  // 3_900_000 kr at 2.40% → 3_900_000_00 * 240 / 10000 / 12 = 7_800_00
  const monthly = monthlyInterestFromRateMinor(3_900_000_00n, 240);
  assert.equal(monthly, 7_800_00n);
});

test("mortgageRateScenarioMonthlyDeltaMinor rises with +100 bps", () => {
  const delta = mortgageRateScenarioMonthlyDeltaMinor({
    principalMinor: 3_900_000_00n,
    currentAnnualRateBps: 240,
    rateDeltaBps: 100,
  });
  assert.ok(delta > 0n);
  assert.equal(
    delta,
    monthlyInterestFromRateMinor(3_900_000_00n, 340) -
      monthlyInterestFromRateMinor(3_900_000_00n, 240),
  );
});

test("summarizePrincipalInterest aggregates payments", () => {
  const s = summarizePrincipalInterest([
    { principalMinor: 10_000_00n, interestMinor: 8_000_00n },
    { principalMinor: 10_000_00n, interestMinor: 7_800_00n },
  ]);
  assert.equal(s.principalMinor, 20_000_00n);
  assert.equal(s.interestMinor, 15_800_00n);
  assert.equal(s.paymentCount, 2);
});
