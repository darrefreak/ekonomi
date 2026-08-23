import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASSUMED_RATE_BPS,
  planDebtPayoff,
  type PayoffDebtInput,
} from "./debt-payoff";

const mortgage: PayoffDebtInput = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Bolån SBAB",
  provider: "SBAB",
  accountType: "MORTGAGE",
  outstandingMinor: 2_550_819_00n,
  interestRateBps: null,
};
const blancoBig: PayoffDebtInput = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Blancolån Marginalen",
  provider: "Marginalen Bank",
  accountType: "LOAN",
  outstandingMinor: 178_749_00n,
  interestRateBps: null,
};
const blancoSmall: PayoffDebtInput = {
  id: "33333333-3333-3333-3333-333333333333",
  name: "Blancolån Facit",
  provider: "Facit Bank",
  accountType: "LOAN",
  outstandingMinor: 144_719_00n,
  interestRateBps: null,
};
const accountCredit: PayoffDebtInput = {
  id: "44444444-4444-4444-4444-444444444444",
  name: "Kontokredit Bank Norwegian",
  provider: "Noba Bank",
  accountType: "CREDIT_CARD",
  outstandingMinor: 71_701_00n,
  interestRateBps: null,
};

const all = [mortgage, blancoBig, blancoSmall, accountCredit];

test("avalanche orders by interest rate: account credit, blanco loans, mortgage last", () => {
  const plan = planDebtPayoff(all, { method: "avalanche" });
  assert.deepEqual(
    plan.items.map((i) => i.id),
    [accountCredit.id, blancoBig.id, blancoSmall.id, mortgage.id],
  );
  assert.equal(plan.items[0]!.priority, 1);
  assert.equal(plan.focus?.id, accountCredit.id);
  // Blanco loans tie on rate → larger balance ranks first (more interest).
  assert.ok(plan.items[1]!.outstandingMinor > plan.items[2]!.outstandingMinor);
});

test("snowball orders by smallest balance first", () => {
  const plan = planDebtPayoff(all, { method: "snowball" });
  assert.deepEqual(
    plan.items.map((i) => i.id),
    [accountCredit.id, blancoSmall.id, blancoBig.id, mortgage.id],
  );
  assert.equal(plan.focus?.id, accountCredit.id);
});

test("missing rates fall back to type assumptions and are flagged", () => {
  const plan = planDebtPayoff(all, { method: "avalanche" });
  assert.equal(plan.hasAssumedRates, true);
  const card = plan.items.find((i) => i.id === accountCredit.id)!;
  assert.equal(card.assumedRate, true);
  assert.equal(card.interestRateBps, ASSUMED_RATE_BPS.CREDIT_CARD);
});

test("a confirmed rate overrides the assumption and is not flagged", () => {
  const withRate = planDebtPayoff(
    [{ ...mortgage, interestRateBps: 500 }, accountCredit],
    { method: "avalanche" },
  );
  const m = withRate.items.find((i) => i.id === mortgage.id)!;
  assert.equal(m.assumedRate, false);
  assert.equal(m.interestRateBps, 500);
});

test("zero-balance debts are excluded from the plan", () => {
  const plan = planDebtPayoff(
    [{ ...accountCredit, outstandingMinor: 0n }, blancoBig],
    { method: "avalanche" },
  );
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0]!.id, blancoBig.id);
});

test("interest shares sum to ~1 and totals aggregate", () => {
  const plan = planDebtPayoff(all, { method: "avalanche" });
  const shareSum = plan.items.reduce((acc, i) => acc + i.interestShare, 0);
  assert.ok(Math.abs(shareSum - 1) < 1e-9);
  const outstandingSum = plan.items.reduce(
    (acc, i) => acc + i.outstandingMinor,
    0n,
  );
  assert.equal(plan.totalOutstandingMinor, outstandingSum);
});

test("projection clears the focus debt and reports interest saved", () => {
  const plan = planDebtPayoff([accountCredit], {
    method: "avalanche",
    extraMonthlyMinor: 5_000_00n,
  });
  assert.ok(plan.projection);
  assert.ok(plan.projection!.focusMonthsToClear! > 0);
  assert.ok(plan.projection!.focusMonthsToClear! < 24);
  assert.ok(plan.projection!.focusInterestPaidMinor > 0n);
});

test("projection reports 'never clears' when the extra cannot outrun interest", () => {
  const plan = planDebtPayoff([{ ...mortgage, interestRateBps: 1_000 }], {
    method: "avalanche",
    extraMonthlyMinor: 100n, // 1 kr against a 2.5M kr balance at 10%
  });
  assert.equal(plan.projection!.focusMonthsToClear, null);
});

test("an empty debt list yields an empty, safe plan", () => {
  const plan = planDebtPayoff([], { method: "avalanche" });
  assert.equal(plan.items.length, 0);
  assert.equal(plan.focus, null);
  assert.equal(plan.totalMonthlyInterestMinor, 0n);
  assert.equal(plan.projection, null);
});
