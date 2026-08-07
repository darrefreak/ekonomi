/** Outstanding liability for display: balances may be stored + or −. */
export function outstandingLiabilityMinor(balanceMinor: bigint): bigint {
  return balanceMinor < 0n ? -balanceMinor : balanceMinor;
}

/**
 * Approximate monthly interest from outstanding principal and annual rate in bps.
 * monthly ≈ principal × (bps / 10_000) / 12
 */
export function monthlyInterestFromRateMinor(
  principalMinor: bigint,
  annualRateBps: number,
): bigint {
  if (principalMinor <= 0n || annualRateBps <= 0) return 0n;
  return (principalMinor * BigInt(Math.round(annualRateBps))) / 10_000n / 12n;
}

/**
 * Monthly cashflow impact of a mortgage rate change (positive = higher expense).
 */
export function mortgageRateScenarioMonthlyDeltaMinor(input: {
  principalMinor: bigint;
  currentAnnualRateBps: number;
  rateDeltaBps: number;
}): bigint {
  const before = monthlyInterestFromRateMinor(
    input.principalMinor,
    input.currentAnnualRateBps,
  );
  const after = monthlyInterestFromRateMinor(
    input.principalMinor,
    input.currentAnnualRateBps + input.rateDeltaBps,
  );
  return after - before;
}

export type PrincipalInterestSummary = {
  principalMinor: bigint;
  interestMinor: bigint;
  paymentCount: number;
};

export function summarizePrincipalInterest(
  rows: Array<{ principalMinor: bigint; interestMinor: bigint }>,
): PrincipalInterestSummary {
  return rows.reduce<PrincipalInterestSummary>(
    (acc, row) => ({
      principalMinor: acc.principalMinor + row.principalMinor,
      interestMinor: acc.interestMinor + row.interestMinor,
      paymentCount: acc.paymentCount + 1,
    }),
    { principalMinor: 0n, interestMinor: 0n, paymentCount: 0 },
  );
}

/** Standard rate shock scenarios for debt UX. */
export const MORTGAGE_RATE_SHOCKS_BPS = [50, 100, 200] as const;
