/**
 * Safe surplus for discretionary investing — NOT investment advice.
 * See docs/METRICS.md § Safe to invest.
 */

export type AvailableToInvestInput = {
  availableCashMinor: bigint;
  minimumCashBalanceMinor: bigint;
  emergencyFundTargetMinor: bigint;
  safetyMarginMinor: bigint;
  reservedSinkingFundMinor: bigint;
  upcoming30dOutflowMinor: bigint;
};

export type AvailableToInvestResult = {
  availableToInvestMinor: bigint;
  deductions: {
    minimumCashBalanceMinor: bigint;
    emergencyFundTargetMinor: bigint;
    safetyMarginMinor: bigint;
    reservedSinkingFundMinor: bigint;
    upcoming30dOutflowMinor: bigint;
    totalDeductedMinor: bigint;
  };
  assumptions: string[];
};

export function calculateAvailableToInvest(
  input: AvailableToInvestInput,
): AvailableToInvestResult {
  const minimumCashBalanceMinor =
    input.minimumCashBalanceMinor < 0n ? 0n : input.minimumCashBalanceMinor;
  const emergencyFundTargetMinor =
    input.emergencyFundTargetMinor < 0n ? 0n : input.emergencyFundTargetMinor;
  const safetyMarginMinor =
    input.safetyMarginMinor < 0n ? 0n : input.safetyMarginMinor;
  const reservedSinkingFundMinor =
    input.reservedSinkingFundMinor < 0n ? 0n : input.reservedSinkingFundMinor;
  const upcoming30dOutflowMinor =
    input.upcoming30dOutflowMinor < 0n ? 0n : input.upcoming30dOutflowMinor;

  const totalDeductedMinor =
    minimumCashBalanceMinor +
    emergencyFundTargetMinor +
    safetyMarginMinor +
    reservedSinkingFundMinor +
    upcoming30dOutflowMinor;

  const raw = input.availableCashMinor - totalDeductedMinor;
  const availableToInvestMinor = raw > 0n ? raw : 0n;

  return {
    availableToInvestMinor,
    deductions: {
      minimumCashBalanceMinor,
      emergencyFundTargetMinor,
      safetyMarginMinor,
      reservedSinkingFundMinor,
      upcoming30dOutflowMinor,
      totalDeductedMinor,
    },
    assumptions: [
      "Beräkningen är deterministisk policy-matematik — inte investeringsrådgivning.",
      "Likvida medel minus minimikassa, buffertmål (nödfond), säkerhetsmarginal, reserverade sinking funds och kommande 30-dagars utbetalningar.",
      "Negativt överskott visas som 0 kr.",
      "Månadsvis investeringsbidragsmål ingår inte som kassadrag (det är ett löpande mål).",
    ],
  };
}
