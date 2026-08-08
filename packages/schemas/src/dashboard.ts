import { z } from "zod";
import { metricMetaSchema } from "./metrics";
import { moneySchema } from "./money";

export const dashboardBriefItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
});

export const dashboardUpcomingItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string(),
  amount: moneySchema,
  kind: z.enum(["bill", "income", "transfer", "other"]),
});

export const dashboardOpportunitySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  estimatedAnnualSaving: moneySchema.nullable(),
  estimateBasis: z.string().nullable().optional(),
  confidence: z.number().nullable(),
  effort: z.string(),
  risk: z.string(),
  priority: z.number(),
  status: z.string(),
  category: z.string(),
});

export const availableToInvestSchema = z.object({
  amount: moneySchema,
  assumptions: z.array(z.string()),
  deductions: z.object({
    minimumCashBalance: moneySchema,
    emergencyFundTarget: moneySchema,
    safetyMargin: moneySchema,
    reservedSinkingFunds: moneySchema,
    upcoming30dOutflows: moneySchema,
    total: moneySchema,
  }),
  disclaimer: z.string(),
});

export const dashboardResponseSchema = z.object({
  greeting: z.string(),
  asOf: z.string(),
  householdName: z.string(),
  metricMeta: metricMetaSchema.optional(),
  position: z.object({
    netWorth: moneySchema,
    netWorthChangeMonth: moneySchema,
    availableCash: moneySchema,
    investments: moneySchema,
    debt: moneySchema,
  }),
  availableToInvest: availableToInvestSchema.optional(),
  thisMonth: z.object({
    income: moneySchema,
    spending: moneySchema,
    savings: moneySchema,
    savingsRatePercent: z.number(),
    budgetRemaining: moneySchema,
  }),
  cashRunwayMonths: z.number(),
  forecast: z.object({
    days30: moneySchema,
    days60: moneySchema,
    days90: moneySchema,
  }),
  brief: z.object({
    headline: z.string(),
    items: z.array(dashboardBriefItemSchema),
  }),
  upcoming: z.array(dashboardUpcomingItemSchema),
  opportunities: z.array(dashboardOpportunitySchema).optional().default([]),
  coveragePercent: z.number(),
  freshnessLabel: z.string(),
  cashflowPoints: z
    .array(
      z.object({
        month: z.string(),
        income: moneySchema,
        spending: moneySchema,
        savings: moneySchema,
      }),
    )
    .optional()
    .default([]),
  coverageFreshness: z
    .array(
      z.object({
        sourceName: z.string(),
        status: z.string(),
        freshnessLabel: z.string().nullable(),
        lastSyncedAt: z.string().nullable().optional(),
      }),
    )
    .optional()
    .default([]),
  coverageAreas: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        status: z.enum(["present", "warning", "missing"]),
      }),
    )
    .optional()
    .default([]),
  reviewCount: z.number().optional().default(0),
  hasAccounts: z.boolean().optional().default(false),
});

export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type DashboardOpportunity = z.infer<typeof dashboardOpportunitySchema>;
