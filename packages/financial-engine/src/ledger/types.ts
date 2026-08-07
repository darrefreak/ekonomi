import type { CurrencyCode, FinancialEventType } from "@ffos/domain";

export type PostingSide = "debit" | "credit";

/** Always use a positive amountMinor; side indicates debit/credit. */
export type LedgerPostingDraft = {
  accountId: string;
  side: PostingSide;
  amountMinor: bigint;
  currency: CurrencyCode;
  memo?: string;
};

export type BalancedLedgerDraft = {
  eventType: FinancialEventType;
  postings: LedgerPostingDraft[];
  expenseAmountMinor: bigint;
  debtReductionMinor: bigint;
  netWorthDeltaMinor: bigint;
};

export class LedgerBalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerBalanceError";
  }
}
