import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAssetDepreciation,
  buildAssetPurchaseAtFairValue,
  buildCashRefund,
  buildCreditCardPayment,
  buildCreditCardPurchase,
  buildInternalTransfer,
  buildInvestmentTransfer,
  buildMortgagePayment,
} from "./postings";
import { findBalanceMismatches, reconstructBalances } from "./reconstruct";

const CASH_A = "cash-a";
const CASH_B = "cash-b";
const INVEST = "invest";
const CC = "credit-card";
const EXPENSE = "expense";
const MORTGAGE = "mortgage";
const INTEREST = "interest-expense";
const VEHICLE = "vehicle-asset";

test("internal transfer 20k: expense 0, NW unchanged", () => {
  const result = buildInternalTransfer({
    fromAccountId: CASH_A,
    toAccountId: CASH_B,
    amountMinor: 20_000_00n,
    currency: "SEK",
  });
  assert.equal(result.expenseAmountMinor, 0n);
  assert.equal(result.netWorthDeltaMinor, 0n);
});

test("investment transfer 20k: expense 0, NW unchanged", () => {
  const result = buildInvestmentTransfer({
    cashAccountId: CASH_A,
    investmentAccountId: INVEST,
    amountMinor: 20_000_00n,
    currency: "SEK",
  });
  assert.equal(result.expenseAmountMinor, 0n);
  assert.equal(result.netWorthDeltaMinor, 0n);
});

test("credit card purchase then payment", () => {
  const purchase = buildCreditCardPurchase({
    expenseAccountId: EXPENSE,
    creditCardAccountId: CC,
    amountMinor: 2_000_00n,
    currency: "SEK",
  });
  assert.equal(purchase.expenseAmountMinor, 2_000_00n);
  assert.equal(purchase.netWorthDeltaMinor, -2_000_00n);

  const payment = buildCreditCardPayment({
    cashAccountId: CASH_A,
    creditCardAccountId: CC,
    amountMinor: 2_000_00n,
    currency: "SEK",
  });
  assert.equal(payment.expenseAmountMinor, 0n);
  assert.equal(payment.netWorthDeltaMinor, 0n);
});

test("mortgage payment principal+interest", () => {
  const result = buildMortgagePayment({
    cashAccountId: CASH_A,
    mortgageAccountId: MORTGAGE,
    interestExpenseAccountId: INTEREST,
    principalMinor: 10_000_00n,
    interestMinor: 8_000_00n,
    currency: "SEK",
  });
  assert.equal(result.expenseAmountMinor, 8_000_00n);
  assert.equal(result.debtReductionMinor, 10_000_00n);
  assert.equal(result.netWorthDeltaMinor, -8_000_00n);
});

test("vehicle cash purchase at fair value: expense 0, NW unchanged", () => {
  const result = buildAssetPurchaseAtFairValue({
    cashAccountId: CASH_A,
    assetAccountId: VEHICLE,
    amountMinor: 300_000_00n,
    currency: "SEK",
  });
  assert.equal(result.expenseAmountMinor, 0n);
  assert.equal(result.netWorthDeltaMinor, 0n);
});

test("vehicle depreciation 300k→280k: cashflow 0, NW -20k", () => {
  const result = buildAssetDepreciation({
    assetAccountId: VEHICLE,
    expenseAccountId: EXPENSE,
    amountMinor: 20_000_00n,
    currency: "SEK",
  });
  assert.equal(result.expenseAmountMinor, 0n);
  assert.equal(result.netWorthDeltaMinor, -20_000_00n);
  const balances = reconstructBalances({
    openings: [
      { accountId: VEHICLE, accountType: "ASSET", openingMinor: 300_000_00n },
      { accountId: EXPENSE, accountType: "EXPENSE", openingMinor: 0n },
    ],
    postings: result.postings,
  });
  assert.equal(balances.get(VEHICLE), 280_000_00n);
});

test("cash refund nets expense and increases NW", () => {
  const result = buildCashRefund({
    cashAccountId: CASH_A,
    expenseAccountId: EXPENSE,
    amountMinor: 500_00n,
    currency: "SEK",
  });
  assert.equal(result.expenseAmountMinor, -500_00n);
  assert.equal(result.netWorthDeltaMinor, 500_00n);
});

test("reconstruct balances: transfer + liability conventions", () => {
  const transfer = buildInternalTransfer({
    fromAccountId: CASH_A,
    toAccountId: CASH_B,
    amountMinor: 20_000_00n,
    currency: "SEK",
  });
  const purchase = buildCreditCardPurchase({
    expenseAccountId: EXPENSE,
    creditCardAccountId: CC,
    amountMinor: 2_000_00n,
    currency: "SEK",
  });
  const balances = reconstructBalances({
    openings: [
      { accountId: CASH_A, accountType: "CHECKING", openingMinor: 100_000_00n },
      { accountId: CASH_B, accountType: "SAVINGS", openingMinor: 0n },
      { accountId: CC, accountType: "CREDIT_CARD", openingMinor: 0n },
      { accountId: EXPENSE, accountType: "EXPENSE", openingMinor: 0n },
    ],
    postings: [...transfer.postings, ...purchase.postings],
  });
  assert.equal(balances.get(CASH_A), 80_000_00n);
  assert.equal(balances.get(CASH_B), 20_000_00n);
  assert.equal(balances.get(CC), 2_000_00n);
});

test("findBalanceMismatches reports cache drift", () => {
  const ledger = new Map([[CASH_A, 80_000_00n]]);
  const mismatches = findBalanceMismatches({
    cached: [{ accountId: CASH_A, balanceMinor: 92_400_00n }],
    ledger,
  });
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0]!.deltaMinor, 12_400_00n);
});
