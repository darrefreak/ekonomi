/**
 * Keep / repair / sell / replace / windows / household fit / recommendation.
 */

import { projectedTco, vehicleNetEquity } from "./tco";
import { keepVsReplace } from "./market";

export type FitPriority = "MUST_HAVE" | "PREFERENCE" | "NICE_TO_HAVE";

export type HouseholdRequirement = {
  key: string;
  label: string;
  priority: FitPriority;
  /** Predicate result supplied by caller after evaluating candidate. */
  satisfied: boolean;
};

export type FitAssessment = {
  mustHaveFailures: string[];
  preferenceScore: number;
  niceToHaveScore: number;
  overallScore: number;
  eligibleForPrimaryRecommendation: boolean;
  summary: string;
};

export function assessHouseholdFit(
  requirements: HouseholdRequirement[],
): FitAssessment {
  const mustFail = requirements
    .filter((r) => r.priority === "MUST_HAVE" && !r.satisfied)
    .map((r) => r.label);
  const prefs = requirements.filter((r) => r.priority === "PREFERENCE");
  const nice = requirements.filter((r) => r.priority === "NICE_TO_HAVE");
  const preferenceScore =
    prefs.length === 0
      ? 1
      : prefs.filter((r) => r.satisfied).length / prefs.length;
  const niceToHaveScore =
    nice.length === 0 ? 1 : nice.filter((r) => r.satisfied).length / nice.length;
  const overallScore =
    mustFail.length > 0
      ? 0
      : 0.6 * preferenceScore + 0.4 * niceToHaveScore;

  return {
    mustHaveFailures: mustFail,
    preferenceScore,
    niceToHaveScore,
    overallScore,
    eligibleForPrimaryRecommendation: mustFail.length === 0,
    summary:
      mustFail.length > 0
        ? `Fails MUST_HAVE: ${mustFail.join(", ")}`
        : `Fit score ${(overallScore * 100).toFixed(0)}%`,
  };
}

export function evaluateRequirementsAgainstCandidate(input: {
  seatsRequired: number;
  isofixRequired: number;
  cargoRequired: boolean;
  towingRequired: boolean;
  homeChargingAvailable: boolean;
  minRangeKm: number | null;
  annualMileageKm: number;
  candidate: {
    seats: number | null;
    isofixCount: number | null;
    cargoOk: boolean;
    towingOk: boolean;
    isElectric: boolean;
    rangeKm: number | null;
    suitableAnnualKm: number | null;
  };
}): HouseholdRequirement[] {
  const c = input.candidate;
  return [
    {
      key: "seats",
      label: `Minst ${input.seatsRequired} säten`,
      priority: "MUST_HAVE",
      satisfied: c.seats == null || c.seats >= input.seatsRequired,
    },
    {
      key: "isofix",
      label: `Minst ${input.isofixRequired} ISOFIX`,
      priority: "MUST_HAVE",
      satisfied: c.isofixCount == null || c.isofixCount >= input.isofixRequired,
    },
    {
      key: "cargo",
      label: "Tillräckligt lastutrymme",
      priority: input.cargoRequired ? "MUST_HAVE" : "PREFERENCE",
      satisfied: !input.cargoRequired || c.cargoOk,
    },
    {
      key: "towing",
      label: "Dragkrok / bogsering",
      priority: input.towingRequired ? "MUST_HAVE" : "NICE_TO_HAVE",
      satisfied: !input.towingRequired || c.towingOk,
    },
    {
      key: "charging",
      label: "Hemmaladdning för elbil",
      priority: "MUST_HAVE",
      satisfied: !c.isElectric || input.homeChargingAvailable,
    },
    {
      key: "range",
      label: input.minRangeKm
        ? `Räckvidd ≥ ${input.minRangeKm} km`
        : "Räckvidd",
      priority: input.minRangeKm ? "PREFERENCE" : "NICE_TO_HAVE",
      satisfied:
        !input.minRangeKm ||
        c.rangeKm == null ||
        c.rangeKm >= input.minRangeKm,
    },
    {
      key: "mileage",
      label: "Passar årlig körsträcka",
      priority: "PREFERENCE",
      satisfied:
        c.suitableAnnualKm == null ||
        c.suitableAnnualKm >= input.annualMileageKm * 0.9,
    },
  ];
}

export function horizonOwnershipCost(input: {
  monthlyEconomicMinor: bigint;
  horizonMonths: number;
  depreciationMinor?: bigint;
  repairReserveMinor?: bigint;
}): {
  totalEconomicMinor: bigint;
  monthlyEconomicMinor: bigint;
  horizonMonths: number;
} {
  const base = projectedTco(input.monthlyEconomicMinor, input.horizonMonths);
  const extra = (input.depreciationMinor ?? 0n) + (input.repairReserveMinor ?? 0n);
  const total = base + extra;
  return {
    totalEconomicMinor: total,
    monthlyEconomicMinor: total / BigInt(Math.max(1, input.horizonMonths)),
    horizonMonths: input.horizonMonths,
  };
}

export function repairAndKeep(input: {
  repairCostMinor: bigint;
  additionalHorizonMonths: number;
  monthlyEconomicAfterRepairMinor: bigint;
  replaceHorizonMonths: number;
  replaceTotalEconomicMinor: bigint;
  replaceCashRequiredTodayMinor: bigint;
}): {
  repairTotalEconomicMinor: bigint;
  replaceTotalEconomicMinor: bigint;
  economicAdvantageMinor: bigint;
  recommendation: "REPAIR_AND_KEEP" | "REPLACE_WITH_CANDIDATE" | "NO_CLEAR_ADVANTAGE";
  summary: string;
  assumptions: string[];
} {
  const repairTotal =
    input.repairCostMinor +
    input.monthlyEconomicAfterRepairMinor *
      BigInt(Math.max(1, input.additionalHorizonMonths));
  // Normalize replace to same horizon length as repair path.
  const months = Math.max(1, input.additionalHorizonMonths);
  const replaceNormalized =
    (input.replaceTotalEconomicMinor *
      BigInt(months)) /
    BigInt(Math.max(1, input.replaceHorizonMonths));

  const advantage = replaceNormalized - repairTotal;
  let recommendation:
    | "REPAIR_AND_KEEP"
    | "REPLACE_WITH_CANDIDATE"
    | "NO_CLEAR_ADVANTAGE" = "NO_CLEAR_ADVANTAGE";
  if (advantage > 15_000_00n) recommendation = "REPAIR_AND_KEEP";
  else if (advantage < -25_000_00n) recommendation = "REPLACE_WITH_CANDIDATE";

  return {
    repairTotalEconomicMinor: repairTotal,
    replaceTotalEconomicMinor: replaceNormalized,
    economicAdvantageMinor: advantage,
    recommendation,
    summary:
      recommendation === "REPAIR_AND_KEEP"
        ? `Reparation (${input.repairCostMinor} öre) ser ekonomiskt bättre ut över ${months} mån.`
        : recommendation === "REPLACE_WITH_CANDIDATE"
          ? "Byte ser ekonomiskt bättre ut — men kontrollera kontantkrav idag."
          : "Ingen tydlig ekonomisk fördel — kontantkrav och risk väger tungt.",
    assumptions: [
      `Same ownership horizon: ${months} months`,
      "Repair cost treated as economic (extends usability)",
      `Replace cash required today: ${input.replaceCashRequiredTodayMinor} öre (separate from TCO)`,
    ],
  };
}

export function sellNow(input: {
  estimatedValueMidMinor: bigint;
  sellingCostMinor: bigint;
  remainingDebtMinor: bigint;
}) {
  const equity = vehicleNetEquity({
    estimatedValueMidMinor: input.estimatedValueMidMinor,
    remainingDebtMinor: input.remainingDebtMinor,
    sellingCostMinor: input.sellingCostMinor,
  });
  return {
    estimatedSaleValueMinor: input.estimatedValueMidMinor,
    sellingCostsMinor: input.sellingCostMinor,
    outstandingDebtMinor: input.remainingDebtMinor,
    expectedCashReleasedMinor: equity.netEquityMinor,
    negativeEquity: equity.negativeEquity,
    negativeEquityMinor: equity.negativeEquityMinor,
  };
}

export function replaceIncremental(input: {
  keepTotalEconomicMinor: bigint;
  candidateTotalEconomicMinor: bigint;
  cashRequiredTodayMinor: bigint;
  horizonMonths: number;
}): {
  economicDeltaMinor: bigint;
  cashRequiredTodayMinor: bigint;
  horizonMonths: number;
  summary: string;
} {
  const economicDeltaMinor =
    input.candidateTotalEconomicMinor - input.keepTotalEconomicMinor;
  return {
    economicDeltaMinor,
    cashRequiredTodayMinor: input.cashRequiredTodayMinor,
    horizonMonths: input.horizonMonths,
    summary:
      economicDeltaMinor < 0n
        ? `Kandidat ~${-economicDeltaMinor} öre lägre ekonomisk kostnad över ${input.horizonMonths} mån, men kräver ${input.cashRequiredTodayMinor} öre kontant idag.`
        : `Kandidat dyrare ekonomiskt med ${economicDeltaMinor} öre över ${input.horizonMonths} mån; kontantkrav ${input.cashRequiredTodayMinor} öre.`,
  };
}

export function computeSellWindow(input: {
  equityMinor: bigint;
  monthsToBindingEnd: number | null;
  medianListingAgeDays: number | null;
  liquidityLabel: "low" | "moderate" | "high" | null;
  nextServiceOn: string | null;
  warrantyEndsOn: string | null;
  asOf: string;
  annualKm: number;
  currentOdometerKm: number;
  valuationLowMinor: bigint | null;
  valuationHighMinor: bigint | null;
}): {
  status: "WAIT" | "WINDOW" | "WATCH" | "SELL_NOW";
  recommendedReviewStart: string | null;
  recommendedReviewEnd: string | null;
  targetOdometerLowKm: number | null;
  targetOdometerHighKm: number | null;
  expectedValueLowMinor: bigint | null;
  expectedValueHighMinor: bigint | null;
  upcomingEvents: string[];
  confidence: number;
  summary: string;
  assumptions: string[];
} {
  const events: string[] = [];
  if (input.nextServiceOn) events.push(`Nästa service: ${input.nextServiceOn}`);
  if (input.warrantyEndsOn) events.push(`Garanti slutar: ${input.warrantyEndsOn}`);
  if (input.monthsToBindingEnd != null) {
    events.push(`Bindningstid ~${input.monthsToBindingEnd} mån kvar`);
  }

  if (input.equityMinor < 0n) {
    return {
      status: "WAIT",
      recommendedReviewStart: null,
      recommendedReviewEnd: null,
      targetOdometerLowKm: input.currentOdometerKm,
      targetOdometerHighKm: input.currentOdometerKm + input.annualKm,
      expectedValueLowMinor: input.valuationLowMinor,
      expectedValueHighMinor: input.valuationHighMinor,
      upcomingEvents: events,
      confidence: 0.7,
      summary: "Negativ equity — amortera eller vänta innan försäljning.",
      assumptions: ["Sell window is a review period, not a single precise date"],
    };
  }

  if (input.equityMinor > 40_000_00n && input.liquidityLabel === "high") {
    return {
      status: "SELL_NOW",
      recommendedReviewStart: input.asOf,
      recommendedReviewEnd: addMonths(input.asOf, 3),
      targetOdometerLowKm: input.currentOdometerKm,
      targetOdometerHighKm: input.currentOdometerKm + Math.round(input.annualKm / 4),
      expectedValueLowMinor: input.valuationLowMinor,
      expectedValueHighMinor: input.valuationHighMinor,
      upcomingEvents: events,
      confidence: 0.6,
      summary: "Positiv equity och hög marknadsaktivitet — överväg försäljning snart.",
      assumptions: [
        "Liquidity is a proxy, not verified sold-through",
        "No single optimal sell date",
      ],
    };
  }

  if (input.monthsToBindingEnd != null && input.monthsToBindingEnd <= 6) {
    return {
      status: "WINDOW",
      recommendedReviewStart: addMonths(input.asOf, 0),
      recommendedReviewEnd: addMonths(
        input.asOf,
        Math.max(3, input.monthsToBindingEnd),
      ),
      targetOdometerLowKm: input.currentOdometerKm,
      targetOdometerHighKm:
        input.currentOdometerKm +
        Math.round((input.annualKm * Math.max(3, input.monthsToBindingEnd)) / 12),
      expectedValueLowMinor: input.valuationLowMinor,
      expectedValueHighMinor: input.valuationHighMinor,
      upcomingEvents: events,
      confidence: 0.65,
      summary: "Säljfönster i förhållande till bindningstid — granska inom perioden.",
      assumptions: ["Review period, not a fake precise date"],
    };
  }

  return {
    status: "WATCH",
    recommendedReviewStart: addMonths(input.asOf, 3),
    recommendedReviewEnd: addMonths(input.asOf, 9),
    targetOdometerLowKm: input.currentOdometerKm + Math.round(input.annualKm / 4),
    targetOdometerHighKm: input.currentOdometerKm + input.annualKm,
    expectedValueLowMinor: input.valuationLowMinor,
    expectedValueHighMinor: input.valuationHighMinor,
    upcomingEvents: events,
    confidence: 0.5,
    summary: "Behåll och bevaka värdeintervall, service och marknadsaktivitet.",
    assumptions: ["Insufficient signal for a narrow sell window"],
  };
}

function addMonths(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

export function computePurchaseWindow(input: {
  compsModelYears: number[];
  compsMileages: number[];
  holdingPeriodMonths: number;
  annualKm: number;
}): {
  recommendedModelYearLow: number | null;
  recommendedModelYearHigh: number | null;
  recommendedMileageLowKm: number | null;
  recommendedMileageHighKm: number | null;
  expectedHoldingPeriodMonths: number;
  targetSaleMileageKm: number | null;
  confidence: number;
  insufficientData: boolean;
  summary: string;
} {
  if (input.compsModelYears.length < 3 || input.compsMileages.length < 3) {
    return {
      recommendedModelYearLow: null,
      recommendedModelYearHigh: null,
      recommendedMileageLowKm: null,
      recommendedMileageHighKm: null,
      expectedHoldingPeriodMonths: input.holdingPeriodMonths,
      targetSaleMileageKm: null,
      confidence: 0,
      insufficientData: true,
      summary: "Otillräcklig marknadsdata för köpfönster — ingen optimum inventerad.",
    };
  }
  const years = [...input.compsModelYears].sort((a, b) => a - b);
  const miles = [...input.compsMileages].sort((a, b) => a - b);
  const yLow = years[Math.floor(years.length * 0.25)]!;
  const yHigh = years[Math.floor(years.length * 0.75)]!;
  const mLow = miles[Math.floor(miles.length * 0.25)]!;
  const mHigh = miles[Math.floor(miles.length * 0.75)]!;
  const midMileage = miles[Math.floor(miles.length / 2)]!;
  const targetSale =
    midMileage + Math.round((input.annualKm * input.holdingPeriodMonths) / 12);

  return {
    recommendedModelYearLow: yLow,
    recommendedModelYearHigh: yHigh,
    recommendedMileageLowKm: mLow,
    recommendedMileageHighKm: mHigh,
    expectedHoldingPeriodMonths: input.holdingPeriodMonths,
    targetSaleMileageKm: targetSale,
    confidence: 0.55,
    insufficientData: false,
    summary: `Baserat på jämförbara annonser: årsmodell ${yLow}–${yHigh}, miltal ${mLow}–${mHigh} km.`,
  };
}

export type VehicleRecommendationKind =
  | "KEEP"
  | "REPAIR_AND_KEEP"
  | "SELL_NOW"
  | "SELL_WITHIN_WINDOW"
  | "REPLACE_WITH_CANDIDATE"
  | "PRIVATE_LEASE"
  | "NO_CLEAR_ADVANTAGE";

export function recommendVehicleAction(input: {
  sellStatus: "WAIT" | "WINDOW" | "WATCH" | "SELL_NOW";
  bestCandidate: {
    id: string;
    name: string;
    economicDeltaMinor: bigint;
    cashRequiredTodayMinor: bigint;
    fitEligible: boolean;
  } | null;
  repair?: {
    recommendation: "REPAIR_AND_KEEP" | "REPLACE_WITH_CANDIDATE" | "NO_CLEAR_ADVANTAGE";
  } | null;
  leaseAdvantageMinor?: bigint | null;
  negativeEquity: boolean;
}): {
  kind: VehicleRecommendationKind;
  financialReason: string;
  cashflowEffect: string;
  householdFit: string;
  assumptions: string[];
  confidence: number;
  risks: string[];
  subjectCandidateId: string | null;
} {
  if (input.repair?.recommendation === "REPAIR_AND_KEEP") {
    return {
      kind: "REPAIR_AND_KEEP",
      financialReason: "Repair path has lower normalized economic cost than replace.",
      cashflowEffect: "Repair cash outlay today; avoid replacement down payment.",
      householdFit: "Keeps current vehicle that already meets household needs.",
      assumptions: ["Repair restores usability for modeled horizon"],
      confidence: 0.65,
      risks: ["Repair may uncover further issues", "Depreciation continues"],
      subjectCandidateId: null,
    };
  }

  if (input.sellStatus === "SELL_NOW" && !input.bestCandidate) {
    return {
      kind: "SELL_NOW",
      financialReason: "Positive equity with elevated market activity.",
      cashflowEffect: "Releases equity after selling costs and debt payoff.",
      householdFit: "No replacement candidate selected — sell-only path.",
      assumptions: ["Valuation from asking comparables"],
      confidence: 0.55,
      risks: ["Ask ≠ sale price", "Liquidity proxy uncertainty"],
      subjectCandidateId: null,
    };
  }

  const cand = input.bestCandidate;
  if (
    cand &&
    cand.fitEligible &&
    cand.economicDeltaMinor < -15_000_00n &&
    cand.cashRequiredTodayMinor <= 100_000_00n
  ) {
    return {
      kind: "REPLACE_WITH_CANDIDATE",
      financialReason: `Candidate ${cand.name} lowers horizon economic cost.`,
      cashflowEffect: `Requires ~${cand.cashRequiredTodayMinor} öre cash today.`,
      householdFit: "Candidate satisfies MUST_HAVE requirements.",
      assumptions: ["Same ownership horizon for keep vs replace", "Mock market asks"],
      confidence: 0.6,
      risks: [
        "Cheaper TCO ≠ affordable today",
        "Switching costs and insurance changes",
      ],
      subjectCandidateId: cand.id,
    };
  }

  if (cand && !cand.fitEligible && cand.economicDeltaMinor < 0n) {
    return {
      kind: "KEEP",
      financialReason: "Cheaper candidate rejected — fails MUST_HAVE fit.",
      cashflowEffect: "No replacement cash required.",
      householdFit: "MUST_HAVE violations block primary recommendation.",
      assumptions: ["Fit constraints dominate pure cost ranking"],
      confidence: 0.7,
      risks: ["Household needs may change"],
      subjectCandidateId: cand.id,
    };
  }

  if (
    input.leaseAdvantageMinor != null &&
    input.leaseAdvantageMinor < -20_000_00n
  ) {
    return {
      kind: "PRIVATE_LEASE",
      financialReason: "Private lease shows lower cash/economic cost for use case.",
      cashflowEffect: "Monthly lease payments; no residual equity.",
      householdFit: "Lease vehicle assumed to meet fit if modeled.",
      assumptions: ["Lease mileage projection within contract"],
      confidence: 0.5,
      risks: ["Excess mileage charges", "Return condition costs"],
      subjectCandidateId: null,
    };
  }

  if (input.sellStatus === "WINDOW") {
    return {
      kind: "SELL_WITHIN_WINDOW",
      financialReason: "Binding/market timing suggests a review window.",
      cashflowEffect: "Potential equity release inside review period.",
      householdFit: "Depends on replacement readiness.",
      assumptions: ["Window is a period, not one date"],
      confidence: 0.55,
      risks: [input.negativeEquity ? "Negative equity risk" : "Market ask volatility"],
      subjectCandidateId: null,
    };
  }

  if (cand) {
    const cmp = keepVsReplace({
      currentMonthlyEconomicMinor: 0n,
      candidateMonthlyEconomicMinor: cand.economicDeltaMinor,
      switchingCostMinor: 0n,
    });
    if (cmp.recommendation === "watch") {
      return {
        kind: "NO_CLEAR_ADVANTAGE",
        financialReason: "Keep vs replace delta within noise band.",
        cashflowEffect: `Replacement would still need ${cand.cashRequiredTodayMinor} öre today.`,
        householdFit: cand.fitEligible ? "Fit OK" : "Fit issues present",
        assumptions: ["24m switching amortization heuristic elsewhere"],
        confidence: 0.5,
        risks: ["Estimate uncertainty"],
        subjectCandidateId: cand.id,
      };
    }
  }

  return {
    kind: "KEEP",
    financialReason: "No candidate clearly beats keep on economics + fit + cash.",
    cashflowEffect: "Continue current financing/ownership cashflows.",
    householdFit: "Current vehicle remains reference.",
    assumptions: ["Same-horizon comparison"],
    confidence: 0.6,
    risks: ["Depreciation and repair reserve"],
    subjectCandidateId: null,
  };
}
