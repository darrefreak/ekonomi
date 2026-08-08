/**
 * Deterministic vehicle market analytics over persisted mock listings.
 * ASKING_PRICE ≠ VERIFIED_TRANSACTION_PRICE ≠ VALUATION_ESTIMATE.
 */

export type PriceKind = "ASKING_PRICE" | "VERIFIED_TRANSACTION_PRICE";

export type MarketListing = {
  id: string;
  make: string;
  model: string;
  variant?: string | null;
  modelYear: number;
  fuelType: string;
  drivetrain?: string | null;
  transmission?: string | null;
  mileageKm: number;
  region?: string | null;
  askPriceMinor: bigint;
  priceKind: PriceKind;
  listedOn: string;
  removedOn?: string | null;
  previousAskPriceMinor?: bigint | null;
  equipment?: string[];
};

export type SubjectVehicle = {
  make: string;
  model: string;
  variant?: string | null;
  modelYear: number;
  fuelType: string;
  drivetrain?: string | null;
  transmission?: string | null;
  mileageKm: number;
  region?: string | null;
  equipment?: string[];
};

export type SelectionLevel = 1 | 2 | 3 | 0;

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function mileageSimilar(a: number, b: number, pct: number): boolean {
  if (a <= 0 || b <= 0) return true;
  const diff = Math.abs(a - b);
  return diff <= Math.max(a, b) * pct;
}

function yearClose(a: number, b: number, window: number): boolean {
  return Math.abs(a - b) <= window;
}

function matchesLevel1(subject: SubjectVehicle, listing: MarketListing): boolean {
  return (
    norm(listing.make) === norm(subject.make) &&
    norm(listing.model) === norm(subject.model) &&
    (!subject.variant ||
      !listing.variant ||
      norm(listing.variant) === norm(subject.variant)) &&
    yearClose(listing.modelYear, subject.modelYear, 1) &&
    mileageSimilar(listing.mileageKm, subject.mileageKm, 0.25) &&
    (!subject.fuelType ||
      !listing.fuelType ||
      norm(listing.fuelType) === norm(subject.fuelType))
  );
}

function matchesLevel2(subject: SubjectVehicle, listing: MarketListing): boolean {
  return (
    norm(listing.make) === norm(subject.make) &&
    norm(listing.model) === norm(subject.model) &&
    yearClose(listing.modelYear, subject.modelYear, 2) &&
    (!subject.fuelType ||
      !listing.fuelType ||
      norm(listing.fuelType) === norm(subject.fuelType)) &&
    (!subject.drivetrain ||
      !listing.drivetrain ||
      norm(listing.drivetrain) === norm(subject.drivetrain))
  );
}

function matchesLevel3(subject: SubjectVehicle, listing: MarketListing): boolean {
  return (
    norm(listing.make) === norm(subject.make) &&
    norm(listing.model) === norm(subject.model) &&
    yearClose(listing.modelYear, subject.modelYear, 4)
  );
}

export function selectComparables(
  subject: SubjectVehicle,
  listings: MarketListing[],
  asOf: string,
): {
  comparables: MarketListing[];
  comparableCount: number;
  selectionLevel: SelectionLevel;
  selectionCriteria: string[];
  confidence: number;
} {
  const active = listings.filter(
    (l) =>
      (!l.removedOn || l.removedOn > asOf) &&
      l.listedOn <= asOf &&
      norm(l.make) === norm(subject.make),
  );

  const level1 = active.filter((l) => matchesLevel1(subject, l));
  if (level1.length >= 5) {
    return {
      comparables: level1,
      comparableCount: level1.length,
      selectionLevel: 1,
      selectionCriteria: [
        "same make/model/variant",
        "±1 model year",
        "mileage within 25%",
        "same fuel type",
      ],
      confidence: Math.min(0.9, 0.55 + level1.length * 0.02),
    };
  }

  const level2 = active.filter((l) => matchesLevel2(subject, l));
  if (level2.length >= 5) {
    return {
      comparables: level2,
      comparableCount: level2.length,
      selectionLevel: 2,
      selectionCriteria: [
        "same make/model/powertrain",
        "±2 model years",
        "widened from level 1 (insufficient comps)",
      ],
      confidence: Math.min(0.75, 0.4 + level2.length * 0.015),
    };
  }

  const level3 = active.filter((l) => matchesLevel3(subject, l));
  if (level3.length >= 3) {
    return {
      comparables: level3,
      comparableCount: level3.length,
      selectionLevel: 3,
      selectionCriteria: [
        "same make/model",
        "±4 model years",
        "broad comparable set — lower confidence",
      ],
      confidence: Math.min(0.55, 0.25 + level3.length * 0.02),
    };
  }

  return {
    comparables: [],
    comparableCount: 0,
    selectionLevel: 0,
    selectionCriteria: ["insufficient comparable listings"],
    confidence: 0,
  };
}

function sortedPrices(listings: MarketListing[]): bigint[] {
  return [...listings.map((l) => l.askPriceMinor)].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
}

function percentile(sorted: bigint[], p: number): bigint | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  // Avoid float money: pick nearer rank (deterministic).
  return idx - lo < hi - idx ? sorted[lo]! : sorted[hi]!;
}

function median(sorted: bigint[]): bigint | null {
  return percentile(sorted, 0.5);
}

/** Drop extreme asks beyond 1.5× IQR from Q1/Q3 when n≥8. */
export function filterOutliers(listings: MarketListing[]): MarketListing[] {
  if (listings.length < 8) return listings;
  const prices = sortedPrices(listings);
  const q1 = percentile(prices, 0.25)!;
  const q3 = percentile(prices, 0.75)!;
  const iqr = q3 - q1;
  const low = q1 - (iqr * 3n) / 2n;
  const high = q3 + (iqr * 3n) / 2n;
  return listings.filter((l) => l.askPriceMinor >= low && l.askPriceMinor <= high);
}

export function computeMarketStats(comparables: MarketListing[]) {
  const filtered = filterOutliers(comparables);
  const prices = sortedPrices(filtered);
  const mileages = [...filtered.map((l) => l.mileageKm)].sort((a, b) => a - b);
  const years = [...filtered.map((l) => l.modelYear)].sort((a, b) => a - b);
  const agesDays = filtered.map((l) => {
    // listing age relative to newest listing date in set
    return l.listedOn;
  });
  const newest = agesDays.slice().sort().at(-1) ?? null;
  const listingAgesDays =
    newest == null
      ? []
      : filtered.map((l) =>
          Math.max(
            0,
            Math.round(
              (Date.parse(`${newest}T00:00:00.000Z`) -
                Date.parse(`${l.listedOn}T00:00:00.000Z`)) /
                86_400_000,
            ),
          ),
        );
  const medianAge =
    listingAgesDays.length === 0
      ? null
      : listingAgesDays.sort((a, b) => a - b)[
          Math.floor(listingAgesDays.length / 2)
        ]!;

  const reductions = filtered.filter(
    (l) =>
      l.previousAskPriceMinor != null && l.previousAskPriceMinor > l.askPriceMinor,
  );

  const askingOnly = filtered.filter((l) => l.priceKind === "ASKING_PRICE");
  const verified = filtered.filter(
    (l) => l.priceKind === "VERIFIED_TRANSACTION_PRICE",
  );

  return {
    listingCount: filtered.length,
    medianAskingPriceMinor: median(prices),
    lowerQuartileMinor: percentile(prices, 0.25),
    upperQuartileMinor: percentile(prices, 0.75),
    mileageMedianKm:
      mileages.length === 0 ? null : mileages[Math.floor(mileages.length / 2)]!,
    mileageMinKm: mileages[0] ?? null,
    mileageMaxKm: mileages.at(-1) ?? null,
    modelYearMin: years[0] ?? null,
    modelYearMax: years.at(-1) ?? null,
    medianListingAgeDays: medianAge,
    priceReductionCount: reductions.length,
    priceReductionRate:
      filtered.length === 0 ? null : reductions.length / filtered.length,
    askingPriceCount: askingOnly.length,
    verifiedTransactionCount: verified.length,
    priceKindLabel:
      verified.length > 0
        ? ("MIXED" as const)
        : ("ASKING_PRICE_ONLY" as const),
  };
}

export function valuationFromComparables(input: {
  stats: ReturnType<typeof computeMarketStats>;
  selectionConfidence: number;
  asOf: string;
  sellingCostRateBps?: number; // default 3%
  remainingDebtMinor?: bigint;
}): {
  estimatedLowMinor: bigint | null;
  estimatedMidMinor: bigint | null;
  estimatedHighMinor: bigint | null;
  expectedSellingCostsMinor: bigint | null;
  estimatedNetSaleProceedsMinor: bigint | null;
  comparableCount: number;
  valuationDate: string;
  confidence: number;
  method: string;
  assumptions: string[];
  insufficientData: boolean;
} {
  const { stats } = input;
  if (
    stats.listingCount < 3 ||
    stats.lowerQuartileMinor == null ||
    stats.medianAskingPriceMinor == null ||
    stats.upperQuartileMinor == null
  ) {
    return {
      estimatedLowMinor: null,
      estimatedMidMinor: null,
      estimatedHighMinor: null,
      expectedSellingCostsMinor: null,
      estimatedNetSaleProceedsMinor: null,
      comparableCount: stats.listingCount,
      valuationDate: input.asOf,
      confidence: 0,
      method: "insufficient_comparables",
      assumptions: ["Need ≥3 comparable listings for a range"],
      insufficientData: true,
    };
  }

  // Round to nearest 5 000 kr to avoid false precision.
  const round5k = (v: bigint) => {
    const step = 5_000_00n;
    return ((v + step / 2n) / step) * step;
  };

  const low = round5k(stats.lowerQuartileMinor);
  const mid = round5k(stats.medianAskingPriceMinor);
  const high = round5k(stats.upperQuartileMinor);
  const rate = BigInt(input.sellingCostRateBps ?? 300); // 3.00%
  const selling = (mid * rate) / 10_000n;
  const debt = input.remainingDebtMinor ?? 0n;
  const net = mid - selling - debt;

  const assumptions = [
    "Range from comparable ASKING prices (not verified sale prices)",
    "Rounded to nearest 5 000 kr",
    `Selling costs assumed ${(Number(rate) / 100).toFixed(2)}% of mid estimate`,
    stats.priceKindLabel === "ASKING_PRICE_ONLY"
      ? "No verified transaction prices in sample"
      : "Sample includes some verified transactions",
  ];

  return {
    estimatedLowMinor: low,
    estimatedMidMinor: mid,
    estimatedHighMinor: high,
    expectedSellingCostsMinor: selling,
    estimatedNetSaleProceedsMinor: net,
    comparableCount: stats.listingCount,
    valuationDate: input.asOf,
    confidence: input.selectionConfidence,
    method: "comparable_asking_quartiles",
    assumptions,
    insufficientData: false,
  };
}

export type MarketSnapshotPoint = {
  asOf: string;
  medianAskingPriceMinor: bigint;
  listingCount: number;
  medianListingAgeDays: number | null;
  priceReductionRate: number | null;
};

function changeOver(
  points: MarketSnapshotPoint[],
  asOf: string,
  days: number,
): {
  medianAskingChangeMinor: bigint | null;
  listingCountChange: number | null;
  medianAgeChangeDays: number | null;
  priceReductionRateChange: number | null;
} | null {
  const tip = points.find((p) => p.asOf === asOf) ?? points.at(-1);
  if (!tip) return null;
  const targetMs = Date.parse(`${tip.asOf}T00:00:00.000Z`) - days * 86_400_000;
  const past = [...points]
    .filter((p) => Date.parse(`${p.asOf}T00:00:00.000Z`) <= targetMs)
    .sort((a, b) => (a.asOf < b.asOf ? -1 : 1))
    .at(-1);
  if (!past) return null;
  return {
    medianAskingChangeMinor: tip.medianAskingPriceMinor - past.medianAskingPriceMinor,
    listingCountChange: tip.listingCount - past.listingCount,
    medianAgeChangeDays:
      tip.medianListingAgeDays != null && past.medianListingAgeDays != null
        ? tip.medianListingAgeDays - past.medianListingAgeDays
        : null,
    priceReductionRateChange:
      tip.priceReductionRate != null && past.priceReductionRate != null
        ? tip.priceReductionRate - past.priceReductionRate
        : null,
  };
}

export function computeMarketTrend(
  points: MarketSnapshotPoint[],
  asOf: string,
) {
  const sorted = [...points].sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
  return {
    d30: changeOver(sorted, asOf, 30),
    d90: changeOver(sorted, asOf, 90),
    m6: changeOver(sorted, asOf, 182),
    m12: changeOver(sorted, asOf, 365),
    pointCount: sorted.length,
    insufficientHistory: sorted.length < 2,
  };
}

/**
 * V1 liquidity proxy — not a claim that removed listings were sold.
 */
export function computeLiquidityProxy(input: {
  activeComparableCount: number;
  medianListingAgeDays: number | null;
  removedLast90d: number;
  newListingsLast30d: number;
  priceReductionRate: number | null;
}): {
  score: number;
  label: "low" | "moderate" | "high";
  methodology: string[];
  caveats: string[];
} {
  let score = 0.35;
  if (input.activeComparableCount >= 15) score += 0.25;
  else if (input.activeComparableCount >= 8) score += 0.15;
  else if (input.activeComparableCount >= 3) score += 0.05;

  if (input.medianListingAgeDays != null) {
    if (input.medianListingAgeDays <= 21) score += 0.15;
    else if (input.medianListingAgeDays <= 45) score += 0.08;
    else if (input.medianListingAgeDays >= 90) score -= 0.1;
  }

  if (input.newListingsLast30d >= 5) score += 0.1;
  if (input.removedLast90d >= 5) score += 0.08;
  if ((input.priceReductionRate ?? 0) >= 0.35) score -= 0.05;

  score = Math.max(0, Math.min(1, score));
  const label = score >= 0.65 ? "high" : score >= 0.4 ? "moderate" : "low";

  return {
    score,
    label,
    methodology: [
      "Active comparable count",
      "Median listing age",
      "New listings (30d) and removals (90d)",
      "Price-reduction frequency",
    ],
    caveats: [
      "Removed listing ≠ sold — may be withdrawn or expired",
      "Based on mock marketplace feed activity, not verified transactions",
      "Labelled as estimated market activity / liquidity proxy",
    ],
  };
}

/** Simple linear sensitivity helpers for tests / explainability. */
export function mileagePriceSlopeMinorPerKm(listings: MarketListing[]): bigint | null {
  if (listings.length < 4) return null;
  const xs = listings.map((l) => l.mileageKm);
  const ys = listings.map((l) => Number(l.askPriceMinor));
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - meanX) * (ys[i]! - meanY);
    den += (xs[i]! - meanX) ** 2;
  }
  if (den === 0) return null;
  return BigInt(Math.round(num / den));
}

export function modelYearPriceSlopeMinorPerYear(
  listings: MarketListing[],
): bigint | null {
  if (listings.length < 4) return null;
  const xs = listings.map((l) => l.modelYear);
  const ys = listings.map((l) => Number(l.askPriceMinor));
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - meanX) * (ys[i]! - meanY);
    den += (xs[i]! - meanX) ** 2;
  }
  if (den === 0) return null;
  return BigInt(Math.round(num / den));
}
