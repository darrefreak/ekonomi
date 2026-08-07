export function keepVsReplace(input: {
  currentMonthlyEconomicMinor: bigint;
  candidateMonthlyEconomicMinor: bigint;
  switchingCostMinor: bigint;
}): { monthlyDeltaMinor: bigint; recommendation: "keep" | "replace" | "watch"; confidence: number } {
  const monthlyDeltaMinor =
    input.candidateMonthlyEconomicMinor - input.currentMonthlyEconomicMinor;
  // Prefer replace only if clearly cheaper after rough switching amortization (~24m)
  const amortizedSwitch = input.switchingCostMinor / 24n;
  const effective = monthlyDeltaMinor + amortizedSwitch;
  if (effective < -800_00n) {
    return { monthlyDeltaMinor: effective, recommendation: "replace", confidence: 0.7 };
  }
  if (effective > 500_00n) {
    return { monthlyDeltaMinor: effective, recommendation: "keep", confidence: 0.75 };
  }
  return { monthlyDeltaMinor: effective, recommendation: "watch", confidence: 0.55 };
}

export function sellWindowHint(equityMinor: bigint, monthsToBindingEnd: number | null) {
  if (equityMinor < 0n) {
    return {
      status: "WAIT" as const,
      summary: "Negativ equity — vänta eller amortera innan försäljning.",
    };
  }
  if (monthsToBindingEnd !== null && monthsToBindingEnd <= 6) {
    return {
      status: "WINDOW" as const,
      summary: "Säljfönster öppnar snart i förhållande till bindning/övriga costs.",
    };
  }
  return {
    status: "WATCH" as const,
    summary: "Behåll och bevaka marknadsintervall + körkostnad.",
  };
}
