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

/**
 * Reports V2 — one aggregation endpoint, many questions.
 *
 * A report is a measure (what is summed) grouped by a dimension (how it is
 * sliced) over an explicit window with optional filters. Drill-down is another
 * request with one more filter, ending at the transaction list; every number
 * keeps an evidence path.
 */

export const reportMeasureSchema = z.enum(["spending", "income", "cashflow"]);
export type ReportMeasure = z.infer<typeof reportMeasureSchema>;

export const reportDimensionSchema = z.enum([
  "category",
  "merchant",
  "account",
  "month",
]);
export type ReportDimension = z.infer<typeof reportDimensionSchema>;

export const reportExploreQuerySchema = z.object({
  householdId: z.string().uuid(),
  measure: reportMeasureSchema.optional().default("spending"),
  dimension: reportDimensionSchema.optional().default("category"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  categoryId: z.string().uuid().optional(),
  merchantId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
});
export type ReportExploreQuery = z.infer<typeof reportExploreQuerySchema>;

export const reportExploreRowSchema = z.object({
  key: z.string(),
  id: z.string().nullable(),
  name: z.string(),
  amountMinor: z.string(),
  transactionCount: z.number(),
  /** Share of the report total, 0–1. */
  share: z.number(),
  /** The next drill step for this row (deeper report or transaction list). */
  drillHref: z.string().nullable(),
});
export type ReportExploreRow = z.infer<typeof reportExploreRowSchema>;

export const reportExploreResponseSchema = z.object({
  asOf: z.string(),
  currency: z.string(),
  measure: reportMeasureSchema,
  dimension: reportDimensionSchema,
  from: z.string(),
  to: z.string(),
  totalMinor: z.string(),
  transactionCount: z.number(),
  rows: z.array(reportExploreRowSchema),
  /** Monthly series over the window, for the chart. */
  series: z.array(
    z.object({ month: z.string(), amountMinor: z.string() }),
  ),
});
export type ReportExploreResponse = z.infer<typeof reportExploreResponseSchema>;

/** Weekly Review — a light "what happened this week" narrative. */
export const weeklyReviewSchema = z.object({
  asOf: z.string(),
  currency: z.string(),
  weekLabel: z.string(),
  from: z.string(),
  to: z.string(),
  spendingMinor: z.string(),
  incomeMinor: z.string(),
  previousWeekSpendingMinor: z.string(),
  largestExpenses: z.array(
    z.object({
      transactionId: z.string(),
      description: z.string(),
      merchantName: z.string().nullable(),
      amountMinor: z.string(),
      date: z.string(),
    }),
  ),
  categoryChanges: z.array(
    z.object({
      categoryKey: z.string(),
      categoryName: z.string(),
      currentMinor: z.string(),
      previousMinor: z.string(),
      changeMinor: z.string(),
    }),
  ),
  newRecurring: z.array(
    z.object({
      recurringId: z.string(),
      name: z.string(),
      monthlyEquivalentMinor: z.string().nullable(),
      firstSeenOn: z.string().nullable(),
    }),
  ),
  upcomingNextWeek: z.array(
    z.object({
      title: z.string(),
      date: z.string(),
      amountMinor: z.string(),
      confidence: z.enum(["KNOWN", "EXPECTED", "ESTIMATED"]),
    }),
  ),
  reviewCount: z.number(),
  savingsProgress: z.object({
    monthToDateMinor: z.string(),
    recommendedMonthlyMinor: z.string().nullable(),
  }),
});
export type WeeklyReview = z.infer<typeof weeklyReviewSchema>;
