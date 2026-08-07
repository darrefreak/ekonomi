import { FinancialEventType, type CurrencyCode } from "@ffos/domain";
import { assertBalancedPostings } from "./balance";
import type { BalancedLedgerDraft, LedgerPostingDraft } from "./types";

function draft(
  eventType: FinancialEventType,
  postings: LedgerPostingDraft[],
  expenseAmountMinor: bigint,
  debtReductionMinor: bigint,
  netWorthDeltaMinor: bigint,
): BalancedLedgerDraft {
  assertBalancedPostings(postings);
  return {
    eventType,
    postings,
    expenseAmountMinor,
    debtReductionMinor,
    netWorthDeltaMinor,
  };
}

/** Internal cash transfer: SEB → SBAB. Expense 0, NW unchanged. */
export function buildInternalTransfer(input: {
  fromAccountId: string;
  toAccountId: string;
  amountMinor: bigint;
  currency: CurrencyCode;
}): BalancedLedgerDraft {
  return draft(
    FinancialEventType.TRANSFER,
    [
      {
        accountId: input.toAccountId,
        side: "debit",
        amountMinor: input.amountMinor,
        currency: input.currency,
        memo: "transfer_in",
      },
      {
        accountId: input.fromAccountId,
        side: "credit",
        amountMinor: input.amountMinor,
        currency: input.currency,
        memo: "transfer_out",
      },
    ],
    0n,
    0n,
    0n,
  );
}

/** Cash → investment asset. Expense 0, NW unchanged pre fees/market. */
export function buildInvestmentTransfer(input: {
  cashAccountId: string;
  investmentAccountId: string;
  amountMinor: bigint;
  currency: CurrencyCode;
}): BalancedLedgerDraft {
  return draft(
    FinancialEventType.INVESTMENT,
    [
      {
        accountId: input.investmentAccountId,
        side: "debit",
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
      {
        accountId: input.cashAccountId,
        side: "credit",
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
    ],
    0n,
    0n,
    0n,
  );
}

/**
 * Credit card purchase.
 * Expense + liability increase. Net worth decreases by purchase amount.
 */
export function buildCreditCardPurchase(input: {
  expenseAccountId: string;
  creditCardAccountId: string;
  amountMinor: bigint;
  currency: CurrencyCode;
}): BalancedLedgerDraft {
  return draft(
    FinancialEventType.CREDIT_CARD_PURCHASE,
    [
      {
        accountId: input.expenseAccountId,
        side: "debit",
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
      {
        accountId: input.creditCardAccountId,
        side: "credit",
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
    ],
    input.amountMinor,
    0n,
    -input.amountMinor,
  );
}

/**
 * Bank → credit card payment.
 * New expense 0; cash down, liability down; NW unchanged from payment alone.
 */
export function buildCreditCardPayment(input: {
  cashAccountId: string;
  creditCardAccountId: string;
  amountMinor: bigint;
  currency: CurrencyCode;
}): BalancedLedgerDraft {
  return draft(
    FinancialEventType.CREDIT_CARD_PAYMENT,
    [
      {
        accountId: input.creditCardAccountId,
        side: "debit",
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
      {
        accountId: input.cashAccountId,
        side: "credit",
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
    ],
    0n,
    0n,
    0n,
  );
}

/**
 * Mortgage payment with principal + interest split.
 * Expense = interest only; debt reduction = principal; NW -= interest.
 */
export function buildMortgagePayment(input: {
  cashAccountId: string;
  mortgageAccountId: string;
  interestExpenseAccountId: string;
  principalMinor: bigint;
  interestMinor: bigint;
  currency: CurrencyCode;
}): BalancedLedgerDraft {
  const total = input.principalMinor + input.interestMinor;
  return draft(
    FinancialEventType.LOAN_PRINCIPAL,
    [
      {
        accountId: input.mortgageAccountId,
        side: "debit",
        amountMinor: input.principalMinor,
        currency: input.currency,
        memo: "principal",
      },
      {
        accountId: input.interestExpenseAccountId,
        side: "debit",
        amountMinor: input.interestMinor,
        currency: input.currency,
        memo: "interest",
      },
      {
        accountId: input.cashAccountId,
        side: "credit",
        amountMinor: total,
        currency: input.currency,
      },
    ],
    input.interestMinor,
    input.principalMinor,
    -input.interestMinor,
  );
}

/** Ordinary cash expense. */
export function buildCashExpense(input: {
  cashAccountId: string;
  expenseAccountId: string;
  amountMinor: bigint;
  currency: CurrencyCode;
}): BalancedLedgerDraft {
  return draft(
    FinancialEventType.EXPENSE,
    [
      {
        accountId: input.expenseAccountId,
        side: "debit",
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
      {
        accountId: input.cashAccountId,
        side: "credit",
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
    ],
    input.amountMinor,
    0n,
    -input.amountMinor,
  );
}

/** Salary / income into cash. */
export function buildIncome(input: {
  cashAccountId: string;
  incomeAccountId: string;
  amountMinor: bigint;
  currency: CurrencyCode;
}): BalancedLedgerDraft {
  return draft(
    FinancialEventType.INCOME,
    [
      {
        accountId: input.cashAccountId,
        side: "debit",
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
      {
        accountId: input.incomeAccountId,
        side: "credit",
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
    ],
    0n,
    0n,
    input.amountMinor,
  );
}

/** Vehicle/home cash purchase at fair value: cash → asset, expense 0. */
export function buildAssetPurchaseAtFairValue(input: {
  cashAccountId: string;
  assetAccountId: string;
  amountMinor: bigint;
  currency: CurrencyCode;
}): BalancedLedgerDraft {
  return draft(
    FinancialEventType.ASSET_PURCHASE,
    [
      {
        accountId: input.assetAccountId,
        side: "debit",
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
      {
        accountId: input.cashAccountId,
        side: "credit",
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
    ],
    0n,
    0n,
    0n,
  );
}
