import { z } from "zod";
import {
  interestRateBpsSchema,
  isoDateSchema,
  nonNegativeAmountMinorStringSchema,
  positiveAmountMinorStringSchema,
  uuidSchema,
} from "./common";
import { moneySchema } from "./money";

export const vehicleFuelTypeSchema = z.enum([
  "PETROL",
  "DIESEL",
  "HYBRID",
  "PLUGIN_HYBRID",
  "ELECTRIC",
  "OTHER",
]);

export const vehicleOwnershipTypeSchema = z.enum([
  "OWNED",
  "FINANCED",
  "LEASED",
  "COMPANY",
  "OTHER",
]);

/**
 * Shared write schema for vehicle create/update (seed + future mutations).
 * Enforces odometer / seats / ISOFIX / date coherence at the boundary.
 */
export const vehicleWriteSchema = z
  .object({
    householdId: uuidSchema,
    name: z.string().min(1).max(160),
    make: z.string().min(1).max(80),
    model: z.string().min(1).max(80),
    modelYear: z.number().int().min(1950).max(2100),
    registrationNumber: z.string().max(20).nullable().optional(),
    fuelType: vehicleFuelTypeSchema,
    ownershipType: vehicleOwnershipTypeSchema,
    purchasePriceMinor: positiveAmountMinorStringSchema.optional(),
    purchaseDate: isoDateSchema.nullable().optional(),
    saleDate: isoDateSchema.nullable().optional(),
    purchaseOdometerKm: z.number().int().min(0).max(2_000_000).optional(),
    currentOdometerKm: z.number().int().min(0).max(2_000_000).nullable().optional(),
    seats: z.number().int().min(1).max(20).optional(),
    isofixCount: z.number().int().min(0).max(20).optional(),
    estimatedValueMidMinor: nonNegativeAmountMinorStringSchema.optional(),
    annualKm: z.number().int().min(0).max(500_000).optional(),
    leaseStartDate: isoDateSchema.nullable().optional(),
    leaseEndDate: isoDateSchema.nullable().optional(),
    leaseMileageLimitKm: z.number().int().min(0).max(2_000_000).optional(),
    financeLender: z.string().max(120).nullable().optional(),
    financeRemainingMinor: nonNegativeAmountMinorStringSchema.optional(),
    financeMonthlyPaymentMinor: nonNegativeAmountMinorStringSchema.optional(),
    financeInterestRateBps: interestRateBpsSchema.optional(),
    financeEndDate: isoDateSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.purchaseOdometerKm != null &&
      value.currentOdometerKm != null &&
      value.purchaseOdometerKm > value.currentOdometerKm
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Inköpsmätarställning får inte överstiga aktuell mätarställning",
        path: ["currentOdometerKm"],
      });
    }
    if (
      value.seats != null &&
      value.isofixCount != null &&
      value.isofixCount > value.seats
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ISOFIX-platser får inte överstiga antalet säten",
        path: ["isofixCount"],
      });
    }
    if (
      value.purchaseDate &&
      value.saleDate &&
      value.purchaseDate > value.saleDate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Försäljningsdatum får inte vara före inköpsdatum",
        path: ["saleDate"],
      });
    }
    if (
      value.leaseStartDate &&
      value.leaseEndDate &&
      value.leaseStartDate > value.leaseEndDate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Leasingens slut får inte vara före start",
        path: ["leaseEndDate"],
      });
    }
  });

export type VehicleWriteInput = z.infer<typeof vehicleWriteSchema>;

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
  linkedAssetAccountId: z.string().uuid().nullable(),
  linkedLoanAccountId: z.string().uuid().nullable(),
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

/**
 * Real "add vehicle" command (RT-012).
 *
 * `acquisitionMode` decides the financial semantics:
 * - `NEW_PURCHASE` books a ledger event today (cash out / debt up, never
 *   consumption or income).
 * - `EXISTING` onboards an already-owned vehicle as an opening position, so it
 *   never invents current-period spending or income.
 */
export const vehicleAcquisitionModeSchema = z.enum(["NEW_PURCHASE", "EXISTING"]);

export const vehiclePurchaseTypeSchema = z.enum([
  "CASH",
  "FINANCED",
  "PRIVATE_LEASE",
]);

export const createVehicleSchema = z
  .object({
    householdId: uuidSchema,
    name: z.string().min(1).max(160),
    make: z.string().min(1).max(80),
    model: z.string().min(1).max(80),
    variant: z.string().max(80).optional(),
    modelYear: z.number().int().min(1950).max(2100),
    registrationNumber: z.string().max(16).optional(),
    fuelType: vehicleFuelTypeSchema,
    transmission: z.enum(["MANUAL", "AUTOMATIC", "OTHER"]).optional(),
    seats: z.number().int().min(1).max(20).optional(),
    isofixCount: z.number().int().min(0).max(20).optional(),
    currentOdometerKm: z.number().int().min(0).max(2_000_000).optional(),
    annualKm: z.number().int().min(0).max(500_000).optional(),
    currency: z.string().length(3).default("SEK"),

    acquisitionMode: vehicleAcquisitionModeSchema,
    purchaseType: vehiclePurchaseTypeSchema,
    purchaseDate: isoDateSchema,
    purchasePriceMinor: positiveAmountMinorStringSchema,
    currentValueMinor: nonNegativeAmountMinorStringSchema,

    /** CASH + NEW_PURCHASE: account the money leaves. */
    cashAccountId: uuidSchema.optional(),
    /** FINANCED: down payment paid from cash on the purchase date. */
    downPaymentMinor: nonNegativeAmountMinorStringSchema.optional(),
    /** FINANCED: debt still outstanding today. */
    outstandingDebtMinor: nonNegativeAmountMinorStringSchema.optional(),
    financeLender: z.string().max(120).optional(),
    financeInterestRateBps: interestRateBpsSchema.optional(),
    financeMonthlyPaymentMinor: nonNegativeAmountMinorStringSchema.optional(),
    financeEndDate: isoDateSchema.optional(),

    /** PRIVATE_LEASE. */
    leaseMonthlyCostMinor: nonNegativeAmountMinorStringSchema.optional(),
    leaseStartDate: isoDateSchema.optional(),
    leaseEndDate: isoDateSchema.optional(),
    leaseMileageLimitKm: z.number().int().min(0).max(2_000_000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const fail = (message: string, path: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });

    if (value.seats != null && value.isofixCount != null && value.isofixCount > value.seats) {
      fail("ISOFIX-platser får inte överstiga antalet säten", "isofixCount");
    }
    if (value.purchaseType === "FINANCED") {
      if (value.outstandingDebtMinor == null) {
        fail("Ange kvarvarande skuld för ett finansierat fordon.", "outstandingDebtMinor");
      }
      if (
        value.acquisitionMode === "NEW_PURCHASE" &&
        value.downPaymentMinor != null &&
        BigInt(value.downPaymentMinor) > BigInt(value.purchasePriceMinor)
      ) {
        fail("Kontantinsatsen får inte överstiga köpeskillingen.", "downPaymentMinor");
      }
    }
    if (
      value.acquisitionMode === "NEW_PURCHASE" &&
      value.purchaseType !== "PRIVATE_LEASE" &&
      !value.cashAccountId
    ) {
      fail("Välj kontot pengarna dras från.", "cashAccountId");
    }
    if (
      value.purchaseType === "PRIVATE_LEASE" &&
      value.leaseStartDate &&
      value.leaseEndDate &&
      value.leaseStartDate > value.leaseEndDate
    ) {
      fail("Leasingens slut får inte vara före start.", "leaseEndDate");
    }
  });

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

/** Non-financial corrections a user realistically needs to make. */
export const updateVehicleSchema = z
  .object({
    householdId: uuidSchema,
    name: z.string().min(1).max(160).optional(),
    registrationNumber: z.string().max(16).nullable().optional(),
    currentOdometerKm: z.number().int().min(0).max(2_000_000).optional(),
    annualKm: z.number().int().min(0).max(500_000).optional(),
    currentValueMinor: nonNegativeAmountMinorStringSchema.optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
