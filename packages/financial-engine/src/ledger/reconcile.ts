export type ReconcileStatus =
  | "MATCHED"
  | "MISMATCH"
  | "MISSING_REPORTED_BALANCE"
  | "MISSING_LEDGER_DATA"
  | "REVIEW_REQUIRED";

export type AccountReconcileResult = {
  accountId: string;
  status: ReconcileStatus;
  reportedBalanceMinor: bigint | null;
  ledgerCalculatedBalanceMinor: bigint | null;
  differenceMinor: bigint | null;
  currency: string;
  asOf: string;
};

/**
 * Compare provider-reported balance to ledger-calculated balance.
 * Does not auto-adjust either side.
 */
export function reconcileReportedVsLedger(input: {
  accountId: string;
  currency: string;
  asOf: string;
  reportedBalanceMinor: bigint | null | undefined;
  ledgerCalculatedBalanceMinor: bigint | null | undefined;
}): AccountReconcileResult {
  const reported = input.reportedBalanceMinor ?? null;
  const ledger = input.ledgerCalculatedBalanceMinor ?? null;

  if (ledger == null) {
    return {
      accountId: input.accountId,
      status: "MISSING_LEDGER_DATA",
      reportedBalanceMinor: reported,
      ledgerCalculatedBalanceMinor: null,
      differenceMinor: null,
      currency: input.currency,
      asOf: input.asOf,
    };
  }

  if (reported == null) {
    return {
      accountId: input.accountId,
      status: "MISSING_REPORTED_BALANCE",
      reportedBalanceMinor: null,
      ledgerCalculatedBalanceMinor: ledger,
      differenceMinor: null,
      currency: input.currency,
      asOf: input.asOf,
    };
  }

  const differenceMinor = reported - ledger;
  if (differenceMinor === 0n) {
    return {
      accountId: input.accountId,
      status: "MATCHED",
      reportedBalanceMinor: reported,
      ledgerCalculatedBalanceMinor: ledger,
      differenceMinor: 0n,
      currency: input.currency,
      asOf: input.asOf,
    };
  }

  return {
    accountId: input.accountId,
    status: "MISMATCH",
    reportedBalanceMinor: reported,
    ledgerCalculatedBalanceMinor: ledger,
    differenceMinor,
    currency: input.currency,
    asOf: input.asOf,
  };
}
