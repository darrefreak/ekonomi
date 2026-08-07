export type VehicleCostInput = {
  kind: string;
  amountMinor: bigint;
  isEconomicCost: boolean;
};

export type VehicleEquityInput = {
  estimatedValueMidMinor: bigint;
  remainingDebtMinor: bigint;
  sellingCostMinor?: bigint;
};

/** Loan principal / purchase price are cash movements, not economic cost. */
export function isEconomicCostKind(kind: string): boolean {
  return kind !== "LOAN_PRINCIPAL" && kind !== "PURCHASE_PRICE";
}

export function vehicleCashOutflow(costs: VehicleCostInput[]): bigint {
  return costs.reduce((acc, c) => acc + c.amountMinor, 0n);
}

export function vehicleEconomicCost(costs: VehicleCostInput[]): bigint {
  return costs.reduce(
    (acc, c) => (c.isEconomicCost && isEconomicCostKind(c.kind) ? acc + c.amountMinor : acc),
    0n,
  );
}

export function vehicleCostPerKm(economicCostMinor: bigint, km: number): bigint {
  if (km <= 0) return 0n;
  return economicCostMinor / BigInt(km);
}

/** Swedish mil = 10 km. */
export function vehicleCostPerSwedishMile(
  economicCostMinor: bigint,
  km: number,
): bigint {
  return vehicleCostPerKm(economicCostMinor, km) * 10n;
}

export function vehicleNetEquity(input: VehicleEquityInput) {
  const selling = input.sellingCostMinor ?? 0n;
  const netEquityMinor =
    input.estimatedValueMidMinor - input.remainingDebtMinor - selling;
  return {
    netEquityMinor,
    negativeEquity: netEquityMinor < 0n,
    negativeEquityMinor: netEquityMinor < 0n ? -netEquityMinor : 0n,
  };
}

export function projectedTco(
  monthlyEconomicMinor: bigint,
  months: number,
): bigint {
  if (months <= 0) return 0n;
  return monthlyEconomicMinor * BigInt(months);
}

export function kmToSwedishMiles(km: number): number {
  return km / 10;
}
