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
  if (input.principalMinor < 0n || input.interestMinor < 0n) {
    throw new Error("principalMinor and interestMinor must be non-negative");
  }
  if (input.principalMinor === 0n && input.interestMinor === 0n) {
    throw new Error("mortgage payment requires principal or interest");
  }
  const total = input.principalMinor + input.interestMinor;
  const postings: LedgerPostingDraft[] = [];
  if (input.principalMinor > 0n) {
    postings.push({
      accountId: input.mortgageAccountId,
      side: "debit",
      amountMinor: input.principalMinor,
      currency: input.currency,
      memo: "principal",
    });
  }
  if (input.interestMinor > 0n) {
    postings.push({
      accountId: input.interestExpenseAccountId,
      side: "debit",
      amountMinor: input.interestMinor,
      currency: input.currency,
      memo: "interest",
    });
  }
  postings.push({
    accountId: input.cashAccountId,
    side: "credit",
    amountMinor: total,
    currency: input.currency,
  });
  return draft(
    FinancialEventType.LOAN_PRINCIPAL,
    postings,
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

/**
 * Financed asset purchase: asset at full price, cash down payment, loan for remainder.
 * Expense 0; NW unchanged at purchase (asset +P, cash −D, liability +(P−D)).
 */
export function buildFinancedAssetPurchase(input: {
  cashAccountId: string;
  assetAccountId: string;
  loanAccountId: string;
  purchasePriceMinor: bigint;
  downPaymentMinor: bigint;
  currency: CurrencyCode;
}): BalancedLedgerDraft {
  if (input.downPaymentMinor < 0n) {
    throw new Error("downPaymentMinor must be non-negative");
  }
  if (input.downPaymentMinor > input.purchasePriceMinor) {
    throw new Error("downPaymentMinor cannot exceed purchasePriceMinor");
  }
  const financedMinor = input.purchasePriceMinor - input.downPaymentMinor;
  const postings: LedgerPostingDraft[] = [
    {
      accountId: input.assetAccountId,
      side: "debit",
      amountMinor: input.purchasePriceMinor,
      currency: input.currency,
      memo: "asset_purchase",
    },
  ];
  if (input.downPaymentMinor > 0n) {
    postings.push({
      accountId: input.cashAccountId,
      side: "credit",
      amountMinor: input.downPaymentMinor,
      currency: input.currency,
      memo: "down_payment",
    });
  }
  if (financedMinor > 0n) {
    postings.push({
      accountId: input.loanAccountId,
      side: "credit",
      amountMinor: financedMinor,
      currency: input.currency,
      memo: "loan_principal",
    });
  }
  return draft(FinancialEventType.ASSET_PURCHASE, postings, 0n, 0n, 0n);
}

/**
 * Non-cash asset write-down (e.g. vehicle 300k → 280k).
 * Cashflow/expenseAmountMinor = 0 (not a cash spend).
 * Economic cost is tracked separately (vehicle cost events / TCO).
 * Net worth decreases by the write-down amount.
 */
export function buildAssetDepreciation(input: {
  assetAccountId: string;
  expenseAccountId: string;
  amountMinor: bigint;
  currency: CurrencyCode;
}): BalancedLedgerDraft {
  return draft(
    FinancialEventType.ADJUSTMENT,
    [
      {
        accountId: input.expenseAccountId,
        side: "debit",
        amountMinor: input.amountMinor,
        currency: input.currency,
        memo: "depreciation",
      },
      {
        accountId: input.assetAccountId,
        side: "credit",
        amountMinor: input.amountMinor,
        currency: input.currency,
        memo: "asset_write_down",
      },
    ],
    0n,
    0n,
    -input.amountMinor,
  );
}

/**
 * Cash refund / merchant credit.
 * Expense amount is negative so period spending nets down; NW increases.
 */
export function buildCashRefund(input: {
  cashAccountId: string;
  expenseAccountId: string;
  amountMinor: bigint;
  currency: CurrencyCode;
}): BalancedLedgerDraft {
  return draft(
    FinancialEventType.REFUND,
    [
      {
        accountId: input.cashAccountId,
        side: "debit",
        amountMinor: input.amountMinor,
        currency: input.currency,
        memo: "refund_in",
      },
      {
        accountId: input.expenseAccountId,
        side: "credit",
        amountMinor: input.amountMinor,
        currency: input.currency,
        memo: "refund_expense_offset",
      },
    ],
    -input.amountMinor,
    0n,
    input.amountMinor,
  );
}

/** Employer / third-party reimbursement into cash (income-like, not refund of expense). */
export function buildCashReimbursement(input: {
  cashAccountId: string;
  incomeAccountId: string;
  amountMinor: bigint;
  currency: CurrencyCode;
}): BalancedLedgerDraft {
  return draft(
    FinancialEventType.REIMBURSEMENT,
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
