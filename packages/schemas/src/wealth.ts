import { z } from "zod";
import { moneySchema } from "./money";

export const investmentItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  provider: z.string().nullable(),
  accountType: z.string(),
  balance: moneySchema,
  trailingContributions: moneySchema,
  contributionCount: z.number(),
});

export const investmentsResponseSchema = z.object({
  asOf: z.string(),
  currency: z.enum(["SEK", "EUR", "USD", "NOK", "DKK"]),
  totals: z.object({
    balance: moneySchema,
    trailingContributions: moneySchema,
  }),
  items: z.array(investmentItemSchema),
  recentContributions: z.array(
    z.object({
      id: z.string(),
      occurredOn: z.string(),
      description: z.string().nullable(),
      amount: moneySchema,
      accountName: z.string(),
    }),
  ),
});
export type InvestmentsResponse = z.infer<typeof investmentsResponseSchema>;

export const assetItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  provider: z.string().nullable(),
  accountType: z.string(),
  estimatedValue: moneySchema,
  vehicleId: z.string().uuid().nullable(),
  vehicleName: z.string().nullable(),
  vehicleValueLow: moneySchema.nullable(),
  vehicleValueHigh: moneySchema.nullable(),
});

export const assetsResponseSchema = z.object({
  asOf: z.string(),
  currency: z.enum(["SEK", "EUR", "USD", "NOK", "DKK"]),
  totals: z.object({
    estimatedValue: moneySchema,
  }),
  items: z.array(assetItemSchema),
});
export type AssetsResponse = z.infer<typeof assetsResponseSchema>;
