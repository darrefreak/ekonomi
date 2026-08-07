import { z } from "zod";
import { moneySchema } from "./money";

export const cashflowPointSchema = z.object({
  month: z.string(),
  income: moneySchema,
  spending: moneySchema,
  savings: moneySchema,
});

export const cashflowResponseSchema = z.object({
  asOf: z.string(),
  currency: z.string(),
  points: z.array(cashflowPointSchema),
  currentPeriod: z.object({
    label: z.string(),
    income: moneySchema,
    spending: moneySchema,
    savings: moneySchema,
  }),
  previousPeriod: z.object({
    label: z.string(),
    income: moneySchema,
    spending: moneySchema,
    savings: moneySchema,
  }),
  comparison: z.object({
    spendingDelta: moneySchema,
    incomeDelta: moneySchema,
    spendingDeltaPercent: z.number(),
  }),
});

export type CashflowResponse = z.infer<typeof cashflowResponseSchema>;
