/**
 * Net savings rate baseline (Phase 2).
 * Income and spending are already net-of-tax household cashflow style figures
 * that exclude transfers, principal, and investment transfers.
 */
export function calculateNetSavingsRate(input: {
  incomeMinor: bigint;
  spendingMinor: bigint;
}): number {
  if (input.incomeMinor <= 0n) return 0;
  const savings = input.incomeMinor - input.spendingMinor;
  return Number((savings * 10_000n) / input.incomeMinor) / 100;
}
