import { z } from "zod";
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

export const dashboardResponseSchema = z.object({
  greeting: z.string(),
  asOf: z.string(),
  householdName: z.string(),
  position: z.object({
    netWorth: moneySchema,
    netWorthChangeMonth: moneySchema,
    availableCash: moneySchema,
    investments: moneySchema,
    debt: moneySchema,
  }),
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
  coveragePercent: z.number(),
  freshnessLabel: z.string(),
});

export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
