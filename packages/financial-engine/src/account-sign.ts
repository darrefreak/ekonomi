/**
 * Canonical sign convention for account balances.
 *
 * ONE rule governs every stored balance in the system, and every aggregation
 * must obey it rather than re-deriving a sign of its own:
 *
 *   A balance is the account's SIGNED ECONOMIC POSITION FROM THE HOUSEHOLD'S
 *   POINT OF VIEW, expressed in the account's own natural direction.
 *
 * For an asset-class account (`CHECKING`, `SAVINGS`, `CASH`, `INVESTMENT`,
 * `PENSION`, `CRYPTO`, `ASSET`) the balance is what the household owns:
 * `+32 005,36` means the household holds that much, `−32 005,36` means the
 * account is overdrawn.
 *
 * For a liability-class account (`MORTGAGE`, `LOAN`, `CREDIT_CARD`) the balance
 * is what the household OWES:
 *
 *   `+32 005,36` on a liability  the household owes 32 005,36 kr.
 *   `−32 005,36` on a liability  the lender owes the household 32 005,36 kr,
 *                                 e.g. an overpaid card. This is a real,
 *                                 ordinary position, not a data error.
 *
 * This is exactly what `postingBalanceDelta` produces: on a liability a credit
 * increases the owed balance and a debit decreases it, so a principal payment
 * (a debit) moves the balance toward and possibly past zero.
 *
 * Net worth is therefore, without any absolute values anywhere:
 *
 *   netWorth = Σ asset-class balances − Σ liability-class balances
 *
 * A principal payment of 1 000 kr from cash moves cash by −1 000 and the
 * liability by −1 000, so net worth is unchanged. Interest of 100 kr paid from
 * cash moves cash by −100 with no liability movement, so net worth falls by
 * 100. Both fall out of the identity above; neither needs a special case.
 *
 * Presentation is a separate concern. The user is shown debt as a positive
 * magnitude ("Skulder 3 000 000 kr"), and `outstandingDebtMinor` exists for
 * that. It clamps at zero rather than taking an absolute value, because a
 * household with an overpaid card owes nothing — it does not owe the credit.
 * Presentation helpers must never be used inside economic aggregation; that
 * substitution is precisely defect RT2-001.
 */

/** Account types whose balance is a positive-is-owned economic position. */
export const ASSET_CLASS_ACCOUNT_TYPES = [
  "CHECKING",
  "SAVINGS",
  "CASH",
  "INVESTMENT",
  "PENSION",
  "CRYPTO",
  "ASSET",
] as const;

/** Account types whose balance is a positive-is-owed economic position. */
export const LIABILITY_CLASS_ACCOUNT_TYPES = [
  "MORTGAGE",
  "LOAN",
  "CREDIT_CARD",
] as const;

/** Nominal books that never participate in a balance-sheet position. */
export const NOMINAL_ACCOUNT_TYPES = ["EXPENSE", "INCOME"] as const;

const LIABILITY_SET: ReadonlySet<string> = new Set(LIABILITY_CLASS_ACCOUNT_TYPES);
const NOMINAL_SET: ReadonlySet<string> = new Set(NOMINAL_ACCOUNT_TYPES);

export function isLiabilityAccountType(accountType: string): boolean {
  return LIABILITY_SET.has(accountType);
}

export function isNominalAccountType(accountType: string): boolean {
  return NOMINAL_SET.has(accountType);
}

/**
 * The amount by which this account's stored balance changes net worth.
 *
 * Assets contribute themselves; liabilities contribute the negation of what is
 * owed. A liability carrying a credit balance therefore *increases* net worth,
 * which is the correct economics and the whole point of RT2-001.
 */
export function netWorthContributionMinor(
  accountType: string,
  balanceMinor: bigint,
): bigint {
  if (isNominalAccountType(accountType)) return 0n;
  return isLiabilityAccountType(accountType) ? -balanceMinor : balanceMinor;
}

/**
 * PRESENTATION ONLY — what the household currently owes on a liability.
 *
 * Clamps at zero: a credit balance is not a negative debt, it is no debt. Never
 * call this from net worth, debt-total or any other economic aggregation; use
 * the signed balance there.
 */
export function outstandingDebtMinor(balanceMinor: bigint): bigint {
  return balanceMinor > 0n ? balanceMinor : 0n;
}

/**
 * PRESENTATION ONLY — the credit a lender owes the household on a liability,
 * as a positive magnitude. Zero when the household owes money.
 */
export function liabilityCreditMinor(balanceMinor: bigint): bigint {
  return balanceMinor < 0n ? -balanceMinor : 0n;
}
