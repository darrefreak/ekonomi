import { z } from "zod";
import { moneySchema } from "./money";
import { uuidSchema } from "./common";

const moneyMinorString = z.string().regex(/^-?\d+$/);

export const vehicleMarketSnapshotSchema = z.object({
  askLow: moneySchema,
  askMid: moneySchema,
  askHigh: moneySchema,
  sampleSize: z.number(),
  notes: z.string().nullable(),
  askLabel: z.string().optional(),
});

export const vehicleMarketStatsSchema = z.object({
  listingCount: z.number(),
  medianAskingPrice: moneySchema.nullable(),
  lowerQuartile: moneySchema.nullable(),
  upperQuartile: moneySchema.nullable(),
  mileageMedianKm: z.number().nullable(),
  medianListingAgeDays: z.number().nullable(),
  priceReductionRate: z.number().nullable(),
  priceKindLabel: z.string(),
  askLabel: z.string(),
});

export const vehicleMarketValuationSchema = z.object({
  estimatedLow: moneySchema.nullable(),
  estimatedMid: moneySchema.nullable(),
  estimatedHigh: moneySchema.nullable(),
  expectedSellingCosts: moneySchema.nullable(),
  estimatedNetSaleProceeds: moneySchema.nullable(),
  comparableCount: z.number(),
  valuationDate: z.string(),
  confidence: z.number(),
  method: z.string(),
  assumptions: z.array(z.string()),
  insufficientData: z.boolean(),
  askLabel: z.string(),
});

export const vehicleMarketTrendSchema = z.object({
  d30: z
    .object({
      medianAskingChange: moneySchema.nullable(),
      listingCountChange: z.number().nullable(),
    })
    .nullable(),
  d90: z
    .object({
      medianAskingChange: moneySchema.nullable(),
      listingCountChange: z.number().nullable(),
    })
    .nullable(),
  m6: z
    .object({
      medianAskingChange: moneySchema.nullable(),
      listingCountChange: z.number().nullable(),
    })
    .nullable(),
  m12: z
    .object({
      medianAskingChange: moneySchema.nullable(),
      listingCountChange: z.number().nullable(),
    })
    .nullable(),
  pointCount: z.number(),
  insufficientHistory: z.boolean(),
  askLabel: z.string(),
});

export const vehicleMarketLiquiditySchema = z.object({
  score: z.number(),
  label: z.enum(["low", "moderate", "high"]),
  methodology: z.array(z.string()),
  caveats: z.array(z.string()),
});

export const vehicleHouseholdRequirementsSchema = z.object({
  seatsRequired: z.number(),
  isofixRequired: z.number(),
  cargoRequired: z.boolean(),
  towingRequired: z.boolean(),
  homeChargingAvailable: z.boolean(),
  minRangeKm: z.number().nullable(),
  annualMileageKm: z.number(),
});

export const vehicleCandidateFitSchema = z.object({
  mustHaveFailures: z.array(z.string()),
  preferenceScore: z.number(),
  overallScore: z.number(),
  eligibleForPrimaryRecommendation: z.boolean(),
  summary: z.string(),
});

export const vehicleCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  make: z.string(),
  model: z.string(),
  modelYear: z.number(),
  askPrice: moneySchema,
  estimatedMonthlyEconomic: moneySchema,
  notes: z.string().nullable(),
  status: z.string().optional(),
  variant: z.string().nullable().optional(),
  fuelType: z.string().nullable().optional(),
  mileageKm: z.number().nullable().optional(),
  seats: z.number().nullable().optional(),
  isElectric: z.boolean().optional(),
  holdingPeriodMonths: z.number().optional(),
  fit: vehicleCandidateFitSchema.optional(),
  horizonMonths: z.number().optional(),
  horizonTotalEconomic: moneySchema.optional(),
});

export const vehicleComparisonSchema = z.object({
  id: z.string(),
  title: z.string(),
  monthlyDelta: moneySchema,
  horizonDelta: moneySchema.optional(),
  recommendation: z.string(),
  confidence: z.number().nullable(),
  summary: z.string(),
  candidateId: z.string().optional(),
  fitEligible: z.boolean().optional(),
});

export const vehicleSellWindowSchema = z.object({
  status: z.string(),
  summary: z.string(),
  sellWindowStart: z.string().nullable(),
  sellWindowEnd: z.string().nullable(),
  targetEquity: moneySchema.nullable(),
  monthsToBindingEnd: z.number().nullable().optional(),
  currentEquity: moneySchema.nullable().optional(),
  recommendedReviewStart: z.string().nullable().optional(),
  recommendedReviewEnd: z.string().nullable().optional(),
  confidence: z.number().optional(),
});

export const vehiclePurchaseWindowSchema = z.object({
  recommendedModelYearLow: z.number().nullable(),
  recommendedModelYearHigh: z.number().nullable(),
  recommendedMileageLowKm: z.number().nullable(),
  recommendedMileageHighKm: z.number().nullable(),
  expectedHoldingPeriodMonths: z.number(),
  targetSaleMileageKm: z.number().nullable(),
  confidence: z.number(),
  insufficientData: z.boolean(),
  summary: z.string(),
});

export const vehicleRecommendationSchema = z.object({
  kind: z.string(),
  financialReason: z.string(),
  cashflowEffect: z.string(),
  householdFit: z.string(),
  assumptions: z.array(z.string()),
  confidence: z.number(),
  risks: z.array(z.string()),
  subjectCandidateId: z.string().nullable(),
});

export const vehicleLeaseEconomicsSchema = z.object({
  name: z.string(),
  totalExpectedLeaseCash: moneySchema,
  monthlyNormalizedCash: moneySchema,
  costPerSwedishMile: moneySchema.nullable(),
  expectedExcessMileageKm: z.number(),
  expectedExcessChargeLow: moneySchema,
  expectedExcessChargeHigh: moneySchema,
  remainingContractMonths: z.number(),
  assumptions: z.array(z.string()),
});

export const vehicleAcquisitionRowSchema = z.object({
  mode: z.string(),
  totalCashOutflow: moneySchema,
  totalEconomicCost: moneySchema,
  notes: z.array(z.string()),
});

export const vehicleMarketResponseSchema = z.object({
  asOf: z.string(),
  vehicleId: z.string().uuid().nullable(),
  analysisSource: z.string(),
  currentMonthlyEconomic: moneySchema.nullable(),
  keepHorizonMonths: z.number().optional(),
  snapshot: vehicleMarketSnapshotSchema.nullable(),
  analytics: z
    .object({
      selectionLevel: z.number(),
      comparableCount: z.number(),
      selectionCriteria: z.array(z.string()),
      confidence: z.number(),
      stats: vehicleMarketStatsSchema.nullable(),
      valuation: vehicleMarketValuationSchema.nullable(),
      trend: vehicleMarketTrendSchema.nullable(),
      liquidity: vehicleMarketLiquiditySchema.nullable(),
    })
    .optional(),
  householdRequirements: vehicleHouseholdRequirementsSchema.nullable().optional(),
  candidates: z.array(vehicleCandidateSchema),
  comparisons: z.array(vehicleComparisonSchema),
  replacement: vehicleSellWindowSchema.nullable(),
  purchaseWindow: vehiclePurchaseWindowSchema.nullable().optional(),
  recommendation: vehicleRecommendationSchema.nullable().optional(),
  lease: vehicleLeaseEconomicsSchema.nullable().optional(),
  acquisitionComparison: z
    .object({
      horizonMonths: z.number(),
      rows: z.array(vehicleAcquisitionRowSchema),
    })
    .nullable()
    .optional(),
});
export type VehicleMarketResponse = z.infer<typeof vehicleMarketResponseSchema>;

export const createVehicleCandidateSchema = z.object({
  householdId: uuidSchema,
  name: z.string().min(1).max(160),
  make: z.string().min(1).max(80),
  model: z.string().min(1).max(80),
  modelYear: z.number().int().min(1990).max(2100),
  askPriceMinor: moneyMinorString,
  estimatedMonthlyEconomicMinor: moneyMinorString,
  notes: z.string().max(2000).nullable().optional(),
  variant: z.string().max(80).nullable().optional(),
  fuelType: z.string().max(40).optional(),
  mileageKm: z.number().int().min(0).optional(),
  seats: z.number().int().min(1).max(12).optional(),
  isofixCount: z.number().int().min(0).max(6).optional(),
  cargoOk: z.boolean().optional(),
  towingOk: z.boolean().optional(),
  isElectric: z.boolean().optional(),
  rangeKm: z.number().int().min(0).nullable().optional(),
  holdingPeriodMonths: z.number().int().min(1).max(120).optional(),
});
export type CreateVehicleCandidateInput = z.infer<
  typeof createVehicleCandidateSchema
>;

export const updateVehicleCandidateSchema = createVehicleCandidateSchema
  .partial()
  .omit({ householdId: true })
  .extend({
    householdId: uuidSchema,
  });
export type UpdateVehicleCandidateInput = z.infer<
  typeof updateVehicleCandidateSchema
>;

export const createVehicleCandidateFromListingSchema = z.object({
  householdId: uuidSchema,
  listingId: uuidSchema,
  name: z.string().min(1).max(160).optional(),
  estimatedMonthlyEconomicMinor: moneyMinorString.optional(),
  holdingPeriodMonths: z.number().int().min(1).max(120).optional(),
});
export type CreateVehicleCandidateFromListingInput = z.infer<
  typeof createVehicleCandidateFromListingSchema
>;
