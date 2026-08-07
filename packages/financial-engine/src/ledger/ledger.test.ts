import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAssetPurchaseAtFairValue,
  buildCreditCardPayment,
  buildCreditCardPurchase,
  buildInternalTransfer,
  buildInvestmentTransfer,
  buildMortgagePayment,
} from "./postings";

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
