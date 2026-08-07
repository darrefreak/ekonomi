import type { CurrencyCode } from "@ffos/domain";
import { LedgerBalanceError, type LedgerPostingDraft } from "./types";

export function assertBalancedPostings(postings: LedgerPostingDraft[]): void {
  if (postings.length < 2) {
    throw new LedgerBalanceError("A ledger entry requires at least two postings");
  }
  const currency = postings[0].currency;
  let debit = 0n;
  let credit = 0n;
  for (const p of postings) {
    if (p.amountMinor <= 0n) {
      throw new LedgerBalanceError("Posting amounts must be positive minor units");
    }
    if (p.currency !== currency) {
      throw new LedgerBalanceError(`Currency mismatch: ${currency} vs ${p.currency}`);
    }
    if (p.side === "debit") debit += p.amountMinor;
    else credit += p.amountMinor;
  }
  if (debit !== credit) {
    throw new LedgerBalanceError(
      `Unbalanced entry: debit ${debit} != credit ${credit}`,
    );
  }
}

export function signingAmount(posting: LedgerPostingDraft): bigint {
  return posting.side === "debit" ? posting.amountMinor : -posting.amountMinor;
}

export function zeroCurrency(currency: CurrencyCode): bigint {
  void currency;
  return 0n;
}
