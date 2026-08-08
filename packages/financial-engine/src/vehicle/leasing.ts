/**
 * V1 private-leasing economics (cashflow + economic comparison helpers).
 * Exact integer öre throughout.
 */

export type LeaseAgreementInput = {
  initialFeeMinor: bigint;
  monthlyPaymentMinor: bigint;
  termMonths: number;
  allowedMileageKm: number;
  /** Contract start ISO date. */
  startOn: string;
  /** Contract end ISO date. */
  endOn: string;
  currentMileageKm: number;
  /** Projected annual km if continuing current pace; optional override. */
  projectedAnnualKm?: number;
  excessMileagePriceMinorPerKm: bigint;
  serviceIncluded: boolean;
  insuranceIncluded: boolean;
  tiresIncluded: boolean;
  expectedReturnCostMinor: bigint;
  earlyTerminationCostMinor?: bigint | null;
};

export type LeaseEconomics = {
  totalExpectedLeaseCashMinor: bigint;
  monthlyNormalizedCashMinor: bigint;
  costPerSwedishMileMinor: bigint | null;
  expectedExcessMileageKm: number;
  expectedExcessChargeLowMinor: bigint;
  expectedExcessChargeHighMinor: bigint;
  projectedEndMileageKm: number;
  elapsedContractMonths: number;
  remainingContractMonths: number;
  assumptions: string[];
};

function monthsBetween(from: string, to: string): number {
  const a = new Date(`${from.slice(0, 10)}T00:00:00.000Z`);
  const b = new Date(`${to.slice(0, 10)}T00:00:00.000Z`);
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth())
  );
}

export function projectLeaseMileage(input: {
  startOn: string;
  endOn: string;
  asOf: string;
  currentMileageKm: number;
  /** Odometer at contract start (0 if unknown → treat current as elapsed distance). */
  startMileageKm?: number;
  projectedAnnualKm?: number;
}): {
  elapsedMonths: number;
  remainingMonths: number;
  termMonths: number;
  projectedEndMileageKm: number;
  expectedExcessMileageKm: number;
  allowedMileageKm: number;
} {
  const termMonths = Math.max(1, monthsBetween(input.startOn, input.endOn));
  const elapsedMonths = Math.max(
    0,
    Math.min(termMonths, monthsBetween(input.startOn, input.asOf)),
  );
  const remainingMonths = Math.max(0, termMonths - elapsedMonths);
  const startOd = input.startMileageKm ?? 0;
  const driven = Math.max(0, input.currentMileageKm - startOd);
  const paceAnnual =
    input.projectedAnnualKm ??
    (elapsedMonths > 0 ? Math.round((driven * 12) / elapsedMonths) : 15_000);
  const projectedRemaining = Math.round((paceAnnual * remainingMonths) / 12);
  const projectedEnd = input.currentMileageKm + projectedRemaining;
  return {
    elapsedMonths,
    remainingMonths,
    termMonths,
    projectedEndMileageKm: projectedEnd,
    expectedExcessMileageKm: 0, // filled by caller with allowance
    allowedMileageKm: 0,
  };
}

export function calculateLeaseEconomics(
  input: LeaseAgreementInput,
  asOf: string,
): LeaseEconomics {
  const termMonths = Math.max(1, input.termMonths);
  const projection = projectLeaseMileage({
    startOn: input.startOn,
    endOn: input.endOn,
    asOf,
    currentMileageKm: input.currentMileageKm,
    projectedAnnualKm: input.projectedAnnualKm,
  });

  const expectedExcessMileageKm = Math.max(
    0,
    projection.projectedEndMileageKm - input.allowedMileageKm,
  );

  // Band excess charge ±15% around point estimate (contract uncertainty).
  const point = BigInt(expectedExcessMileageKm) * input.excessMileagePriceMinorPerKm;
  const band = (point * 15n) / 100n;
  const low = point > band ? point - band : 0n;
  const high = point + band;

  const payments =
    input.monthlyPaymentMinor * BigInt(termMonths) + input.initialFeeMinor;
  const totalCash =
    payments + input.expectedReturnCostMinor + point;

  const totalKmAllowed = input.allowedMileageKm;
  const swedishMiles = totalKmAllowed / 10;
  const costPerMile =
    swedishMiles > 0 ? totalCash / BigInt(swedishMiles) : null;

  const assumptions = [
    `Term ${termMonths} months`,
    `Allowed mileage ${input.allowedMileageKm} km`,
    `Excess price ${input.excessMileagePriceMinorPerKm} öre/km`,
    input.serviceIncluded ? "Service included" : "Service not included",
    input.insuranceIncluded ? "Insurance included" : "Insurance not included",
    input.tiresIncluded ? "Tires included" : "Tires not included",
    "Removed/return costs are assumptions — not a sale price",
    "Excess charge shown as a range (±15%) around projected mileage",
  ];

  return {
    totalExpectedLeaseCashMinor: totalCash,
    monthlyNormalizedCashMinor: totalCash / BigInt(termMonths),
    costPerSwedishMileMinor: costPerMile,
    expectedExcessMileageKm,
    expectedExcessChargeLowMinor: low,
    expectedExcessChargeHighMinor: high,
    projectedEndMileageKm: projection.projectedEndMileageKm,
    elapsedContractMonths: projection.elapsedMonths,
    remainingContractMonths: projection.remainingMonths,
    assumptions,
  };
}

export type AcquisitionMode = "CASH_PURCHASE" | "FINANCED_PURCHASE" | "PRIVATE_LEASE";

export function compareAcquisitionModes(input: {
  horizonMonths: number;
  cashPurchase: {
    purchasePriceMinor: bigint;
    expectedSaleValueMinor: bigint;
    ownershipEconomicMinor: bigint;
    opportunityCostMinor?: bigint;
  };
  financedPurchase: {
    downPaymentMinor: bigint;
    totalInterestMinor: bigint;
    ownershipEconomicMinor: bigint;
    expectedSaleValueMinor: bigint;
    endingDebtMinor: bigint;
  };
  privateLease: {
    totalLeaseCashMinor: bigint;
    ownershipEconomicMinor: bigint;
  };
}): {
  horizonMonths: number;
  rows: Array<{
    mode: AcquisitionMode;
    totalCashOutflowMinor: bigint;
    totalEconomicCostMinor: bigint;
    notes: string[];
  }>;
} {
  const h = Math.max(1, input.horizonMonths);
  const cashEconomic =
    input.cashPurchase.ownershipEconomicMinor +
    (input.cashPurchase.opportunityCostMinor ?? 0n);
  const cashOut =
    input.cashPurchase.purchasePriceMinor -
    input.cashPurchase.expectedSaleValueMinor +
    (input.cashPurchase.opportunityCostMinor ?? 0n);

  const finEconomic = input.financedPurchase.ownershipEconomicMinor;
  const finCash =
    input.financedPurchase.downPaymentMinor +
    input.financedPurchase.totalInterestMinor +
    input.financedPurchase.endingDebtMinor -
    // sale proceeds reduce cash need at end
    input.financedPurchase.expectedSaleValueMinor;

  return {
    horizonMonths: h,
    rows: [
      {
        mode: "CASH_PURCHASE",
        totalCashOutflowMinor: cashOut,
        totalEconomicCostMinor: cashEconomic,
        notes: [
          "Cashflow ≠ economic cost",
          input.cashPurchase.opportunityCostMinor
            ? "Includes configured opportunity cost"
            : "Opportunity cost not applied",
        ],
      },
      {
        mode: "FINANCED_PURCHASE",
        totalCashOutflowMinor: finCash,
        totalEconomicCostMinor: finEconomic,
        notes: ["Includes interest as economic cost component"],
      },
      {
        mode: "PRIVATE_LEASE",
        totalCashOutflowMinor: input.privateLease.totalLeaseCashMinor,
        totalEconomicCostMinor: input.privateLease.ownershipEconomicMinor,
        notes: ["No residual ownership equity at term end"],
      },
    ],
  };
}
