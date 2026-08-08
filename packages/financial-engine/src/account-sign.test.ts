import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isLiabilityAccountType,
  isNominalAccountType,
  liabilityCreditMinor,
  netWorthContributionMinor,
  outstandingDebtMinor,
} from "./account-sign";
import { netWorthFromTypedBalances, type TypedAccountBalance } from "./wealth";

test("liability and nominal classification", () => {
  for (const type of ["MORTGAGE", "LOAN", "CREDIT_CARD"]) {
    assert.equal(isLiabilityAccountType(type), true, type);
  }
  for (const type of ["CHECKING", "SAVINGS", "CASH", "INVESTMENT", "ASSET"]) {
    assert.equal(isLiabilityAccountType(type), false, type);
  }
  assert.equal(isNominalAccountType("EXPENSE"), true);
  assert.equal(isNominalAccountType("INCOME"), true);
  assert.equal(isNominalAccountType("CHECKING"), false);
});

test("net worth contribution follows the account's economic direction", () => {
  assert.equal(netWorthContributionMinor("CHECKING", 100_00n), 100_00n);
  assert.equal(netWorthContributionMinor("CHECKING", -100_00n), -100_00n);
  assert.equal(netWorthContributionMinor("MORTGAGE", 100_00n), -100_00n);
  // A credit on a liability is an economic positive for the household.
  assert.equal(netWorthContributionMinor("CREDIT_CARD", -100_00n), 100_00n);
  // Nominal books never sit on the balance sheet.
  assert.equal(netWorthContributionMinor("EXPENSE", 999_00n), 0n);
  assert.equal(netWorthContributionMinor("INCOME", 999_00n), 0n);
});

test("presentation helpers never invent or hide money", () => {
  assert.equal(outstandingDebtMinor(3_000_000_00n), 3_000_000_00n);
  assert.equal(outstandingDebtMinor(-2_000_00n), 0n);
  assert.equal(liabilityCreditMinor(-2_000_00n), 2_000_00n);
  assert.equal(liabilityCreditMinor(3_000_000_00n), 0n);
  // Owed and credit are mutually exclusive and together describe the balance.
  for (const balance of [-5n, 0n, 5n, -1_600_268n, 367_000_000n]) {
    assert.equal(
      outstandingDebtMinor(balance) - liabilityCreditMinor(balance),
      balance,
    );
  }
});

/**
 * Independent oracle: net worth computed by direct arithmetic over the
 * canonical convention, deliberately NOT by calling `bucketBalancesForNetWorth`
 * or `calculateNetWorth`. If the aggregation under test ever disagrees with
 * this, one of them is wrong and the test says so.
 */
function oracleNetWorthMinor(rows: TypedAccountBalance[]): bigint {
  let total = 0n;
  for (const row of rows) {
    if (isNominalAccountType(row.accountType)) continue;
    if (isLiabilityAccountType(row.accountType)) {
      total -= row.balanceMinor;
    } else {
      total += row.balanceMinor;
    }
  }
  return total;
}

const SCENARIOS: Array<{ name: string; rows: TypedAccountBalance[]; expected: bigint }> = [
  {
    name: "empty household",
    rows: [],
    expected: 0n,
  },
  {
    name: "cash only",
    rows: [{ accountType: "CHECKING", balanceMinor: 100_000_00n }],
    expected: 100_000_00n,
  },
  {
    name: "adding a 10 000 kr asset raises net worth by 10 000 kr",
    rows: [
      { accountType: "CHECKING", balanceMinor: 100_000_00n },
      { accountType: "ASSET", balanceMinor: 10_000_00n },
    ],
    expected: 110_000_00n,
  },
  {
    name: "adding a 10 000 kr liability lowers net worth by 10 000 kr",
    rows: [
      { accountType: "CHECKING", balanceMinor: 100_000_00n },
      { accountType: "LOAN", balanceMinor: 10_000_00n },
    ],
    expected: 90_000_00n,
  },
  {
    name: "principal repayment moves cash and debt together, net worth flat",
    rows: [
      { accountType: "CHECKING", balanceMinor: 99_000_00n },
      { accountType: "LOAN", balanceMinor: 9_000_00n },
    ],
    expected: 90_000_00n,
  },
  {
    name: "interest paid from cash lowers net worth by the interest",
    rows: [
      { accountType: "CHECKING", balanceMinor: 98_900_00n },
      { accountType: "LOAN", balanceMinor: 9_000_00n },
    ],
    expected: 89_900_00n,
  },
  {
    name: "fully repaid liability contributes nothing",
    rows: [
      { accountType: "CHECKING", balanceMinor: 50_000_00n },
      { accountType: "CREDIT_CARD", balanceMinor: 0n },
    ],
    expected: 50_000_00n,
  },
  {
    name: "overpaid credit card is an asset-like position",
    rows: [
      { accountType: "CHECKING", balanceMinor: 97_000_00n },
      { accountType: "CREDIT_CARD", balanceMinor: -2_000_00n },
    ],
    expected: 99_000_00n,
  },
  {
    name: "overdrawn checking is a negative position",
    rows: [
      { accountType: "CHECKING", balanceMinor: -1_500_00n },
      { accountType: "SAVINGS", balanceMinor: 10_000_00n },
    ],
    expected: 8_500_00n,
  },
  {
    name: "full balance sheet with mortgage, car loan and overpaid card",
    rows: [
      { accountType: "CHECKING", balanceMinor: 45_000_00n },
      { accountType: "SAVINGS", balanceMinor: 120_000_00n },
      { accountType: "INVESTMENT", balanceMinor: 380_000_00n },
      { accountType: "PENSION", balanceMinor: 210_000_00n },
      { accountType: "ASSET", balanceMinor: 4_200_000_00n },
      { accountType: "MORTGAGE", balanceMinor: 3_100_000_00n },
      { accountType: "LOAN", balanceMinor: 148_500_00n },
      { accountType: "CREDIT_CARD", balanceMinor: -3_250_00n },
      { accountType: "EXPENSE", balanceMinor: 92_000_00n },
      { accountType: "INCOME", balanceMinor: 640_000_00n },
    ],
    // 45k+120k+380k+210k+4 200k = 4 955 000; liabilities 3 100k+148.5k−3.25k = 3 245 250
    expected: 1_709_750_00n,
  },
  {
    name: "household deep underwater",
    rows: [
      { accountType: "CHECKING", balanceMinor: 2_000_00n },
      { accountType: "ASSET", balanceMinor: 1_500_000_00n },
      { accountType: "MORTGAGE", balanceMinor: 2_100_000_00n },
    ],
    expected: -598_000_00n,
  },
];

for (const scenario of SCENARIOS) {
  test(`net worth oracle — ${scenario.name}`, () => {
    // The hand-written expectation and the oracle must agree, so a typo in the
    // table cannot silently define truth.
    assert.equal(
      oracleNetWorthMinor(scenario.rows),
      scenario.expected,
      "oracle disagrees with the hand-computed expectation",
    );
    assert.equal(
      netWorthFromTypedBalances(scenario.rows, "SEK").amountMinor,
      scenario.expected,
      "product aggregation disagrees with the independent expectation",
    );
  });
}

test("net worth is linear in every account balance", () => {
  const base: TypedAccountBalance[] = [
    { accountType: "CHECKING", balanceMinor: 100_000_00n },
    { accountType: "MORTGAGE", balanceMinor: 2_000_000_00n },
    { accountType: "CREDIT_CARD", balanceMinor: 1_500_00n },
  ];
  const before = netWorthFromTypedBalances(base, "SEK").amountMinor;

  const deltas: Array<[string, bigint, bigint]> = [
    ["CHECKING", 10_000_00n, 10_000_00n],
    ["CHECKING", -10_000_00n, -10_000_00n],
    ["MORTGAGE", 10_000_00n, -10_000_00n],
    ["MORTGAGE", -10_000_00n, 10_000_00n],
    ["CREDIT_CARD", 3_000_00n, -3_000_00n],
    // Pushing the card past zero into credit keeps the same slope.
    ["CREDIT_CARD", -4_000_00n, 4_000_00n],
  ];

  for (const [accountType, delta, expectedNetWorthDelta] of deltas) {
    const mutated = base.map((row) =>
      row.accountType === accountType
        ? { ...row, balanceMinor: row.balanceMinor + delta }
        : row,
    );
    const after = netWorthFromTypedBalances(mutated, "SEK").amountMinor;
    assert.equal(
      after - before,
      expectedNetWorthDelta,
      `${accountType} ${delta} should move net worth by ${expectedNetWorthDelta}`,
    );
  }
});

test("debt display magnitude never leaks into net worth arithmetic", () => {
  const rows: TypedAccountBalance[] = [
    { accountType: "CHECKING", balanceMinor: 500_000_00n },
    { accountType: "MORTGAGE", balanceMinor: 3_000_000_00n },
  ];
  // The user sees debt as a positive 3 000 000 kr…
  assert.equal(outstandingDebtMinor(3_000_000_00n), 3_000_000_00n);
  // …and net worth subtracts exactly that, no more and no less.
  assert.equal(
    netWorthFromTypedBalances(rows, "SEK").amountMinor,
    500_000_00n - 3_000_000_00n,
  );
});
