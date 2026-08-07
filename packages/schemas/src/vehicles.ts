import { z } from "zod";
import { moneySchema } from "./money";

export const vehicleSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  make: z.string(),
  model: z.string(),
  modelYear: z.number(),
  registrationNumber: z.string().nullable(),
  ownershipType: z.string(),
  estimatedValueMid: moneySchema.nullable(),
  remainingDebt: moneySchema.nullable(),
  netEquity: moneySchema.nullable(),
  monthlyEconomicCost: moneySchema.nullable(),
});

export const vehiclesResponseSchema = z.object({
  asOf: z.string(),
  items: z.array(vehicleSummarySchema),
});

export type VehiclesResponse = z.infer<typeof vehiclesResponseSchema>;

export const vehicleCostEventSchema = z.object({
  id: z.string(),
  kind: z.string(),
  occurredOn: z.string(),
  amount: moneySchema,
  isEconomicCost: z.boolean(),
  description: z.string().nullable(),
  odometerKm: z.number().nullable(),
});

export const vehicleDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  make: z.string(),
  model: z.string(),
  modelYear: z.number(),
  registrationNumber: z.string().nullable(),
  fuelType: z.string(),
  ownershipType: z.string(),
  purchasePrice: moneySchema.nullable(),
  purchaseDate: z.string().nullable(),
  valuation: z.object({
    low: moneySchema.nullable(),
    mid: moneySchema.nullable(),
    high: moneySchema.nullable(),
    asOf: z.string().nullable(),
  }),
  finance: z
    .object({
      lender: z.string(),
      remaining: moneySchema,
      monthlyPayment: moneySchema,
      interestRatePercent: z.number(),
      endDate: z.string().nullable(),
    })
    .nullable(),
  usage: z.object({
    annualKm: z.number(),
    annualSwedishMiles: z.number(),
    currentOdometerKm: z.number().nullable(),
  }),
  metrics: z.object({
    cashOutflow12m: moneySchema,
    economicCost12m: moneySchema,
    monthlyEconomicCost: moneySchema,
    costPerKm: moneySchema,
    costPerSwedishMile: moneySchema,
    netEquity: moneySchema,
    negativeEquity: z.boolean(),
    projectedTco12m: moneySchema,
    projectedTco24m: moneySchema,
    projectedTco36m: moneySchema,
  }),
  recentCosts: z.array(vehicleCostEventSchema),
  costs: z.array(vehicleCostEventSchema).default([]),
  odometerHistory: z
    .array(
      z.object({
        id: z.string(),
        readingKm: z.number(),
        recordedOn: z.string(),
        source: z.string(),
      }),
    )
    .default([]),
  linkedEvents: z
    .array(
      z.object({
        id: z.string(),
        occurredOn: z.string(),
        description: z.string().nullable(),
        amount: moneySchema,
      }),
    )
    .default([]),
});

export type VehicleDetailDto = z.infer<typeof vehicleDetailSchema>;
