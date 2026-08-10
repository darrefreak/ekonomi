import { z } from "zod";
import { metricMetaSchema } from "./metrics";
import { moneySchema } from "./money";

export const debtRateScenarioSchema = z.object({
  rateDeltaBps: z.number(),
  label: z.string(),
  monthlyInterestDelta: moneySchema,
  projectedMonthlyInterest: moneySchema,
});

export const debtItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  provider: z.string().nullable(),
  accountType: z.enum(["MORTGAGE", "LOAN", "CREDIT_CARD"]),
  outstanding: moneySchema,
  interestRateBps: z.number().nullable(),
  interestRatePercent: z.number().nullable(),
  bindingEndDate: z.string().nullable(),
  estimatedMonthlyInterest: moneySchema.nullable(),
  trailingPrincipal: moneySchema,
  trailingInterest: moneySchema,
  trailingPaymentCount: z.number(),
  rateScenarios: z.array(debtRateScenarioSchema).default([]),
});

export const debtPaymentSchema = z.object({
  id: z.string(),
  occurredOn: z.string(),
  description: z.string().nullable(),
  principal: moneySchema,
  interest: moneySchema,
  total: moneySchema,
});

export const debtResponseSchema = z.object({
  asOf: z.string(),
  currency: z.enum(["SEK", "EUR", "USD", "NOK", "DKK"]),
  metricMeta: metricMetaSchema.optional(),
  totals: z.object({
    outstanding: moneySchema,
    mortgages: moneySchema,
    loans: moneySchema,
    creditCards: moneySchema,
    trailingPrincipal: moneySchema,
    trailingInterest: moneySchema,
  }),
  items: z.array(debtItemSchema),
});
export type DebtResponse = z.infer<typeof debtResponseSchema>;

export const debtDetailResponseSchema = z.object({
  asOf: z.string(),
  item: debtItemSchema,
  payments: z.array(debtPaymentSchema),
});
export type DebtDetailResponse = z.infer<typeof debtDetailResponseSchema>;
