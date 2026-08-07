import { z } from "zod";
import { metricMetaSchema } from "./metrics";
import { moneySchema } from "./money";

export const monthlyReportSchema = z.object({
  period: z.string(),
  asOf: z.string(),
  metricMeta: metricMetaSchema.optional(),
  income: moneySchema,
  spending: moneySchema,
  savings: moneySchema,
  savingsRatePercent: z.number(),
  savingsRateMetricKey: z.string().optional(),
  savingsRateCalculationVersion: z.string().optional(),
  netWorth: moneySchema.nullable().optional(),
  netWorthChange: moneySchema.nullable().optional(),
  topCategories: z.array(
    z.object({
      categoryKey: z.string(),
      categoryName: z.string(),
      spending: moneySchema,
    }),
  ),
});

export const yearlyReportSchema = z.object({
  year: z.number(),
  asOf: z.string(),
  metricMeta: metricMetaSchema.optional(),
  income: moneySchema,
  spending: moneySchema,
  savings: moneySchema,
  savingsRatePercent: z.number(),
  savingsRateMetricKey: z.string().optional(),
  savingsRateCalculationVersion: z.string().optional(),
  months: z.array(
    z.object({
      period: z.string(),
      income: moneySchema,
      spending: moneySchema,
      savings: moneySchema,
    }),
  ),
});

export type MonthlyReport = z.infer<typeof monthlyReportSchema>;
export type YearlyReport = z.infer<typeof yearlyReportSchema>;
