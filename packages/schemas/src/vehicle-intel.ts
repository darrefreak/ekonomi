import { z } from "zod";
import { moneySchema } from "./money";

export const vehicleMarketResponseSchema = z.object({
  asOf: z.string(),
  snapshot: z
    .object({
      askLow: moneySchema,
      askMid: moneySchema,
      askHigh: moneySchema,
      sampleSize: z.number(),
      notes: z.string().nullable(),
    })
    .nullable(),
  candidates: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      make: z.string(),
      model: z.string(),
      modelYear: z.number(),
      askPrice: moneySchema,
      estimatedMonthlyEconomic: moneySchema,
      notes: z.string().nullable(),
    }),
  ),
  comparisons: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      monthlyDelta: moneySchema,
      recommendation: z.string(),
      confidence: z.number().nullable(),
      summary: z.string(),
    }),
  ),
  replacement: z
    .object({
      status: z.string(),
      summary: z.string(),
      sellWindowStart: z.string().nullable(),
      sellWindowEnd: z.string().nullable(),
      targetEquity: moneySchema.nullable(),
    })
    .nullable(),
});
export type VehicleMarketResponse = z.infer<typeof vehicleMarketResponseSchema>;
