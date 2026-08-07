import { z } from "zod";
import { moneySchema } from "./money";

export const budgetLineSchema = z.object({
  id: z.string(),
  categoryKey: z.string(),
  name: z.string(),
  planned: moneySchema,
  actual: moneySchema,
  remaining: moneySchema,
  variance: moneySchema,
  utilizationPercent: z.number(),
});

export const budgetResponseSchema = z.object({
  asOf: z.string(),
  period: z.object({
    id: z.string(),
    label: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    status: z.string(),
  }),
  currency: z.enum(["SEK", "EUR", "USD", "NOK", "DKK"]),
  totals: z.object({
    planned: moneySchema,
    actual: moneySchema,
    remaining: moneySchema,
    variance: moneySchema,
    utilizationPercent: z.number(),
  }),
  lines: z.array(budgetLineSchema),
});

export type BudgetResponse = z.infer<typeof budgetResponseSchema>;

export const subscriptionItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  cadence: z.string(),
  amount: moneySchema,
  annualCost: moneySchema,
  lastChargedOn: z.string().nullable(),
  nextChargeOn: z.string().nullable(),
  priceTrendPercent: z.number().nullable(),
  merchantName: z.string().nullable(),
});

export const subscriptionsResponseSchema = z.object({
  asOf: z.string(),
  totalMonthly: moneySchema,
  totalAnnual: moneySchema,
  items: z.array(subscriptionItemSchema),
  recurring: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.string(),
      cadence: z.string(),
      amount: moneySchema,
      status: z.string(),
      nextExpectedOn: z.string().nullable(),
      confidence: z.number().nullable(),
    }),
  ),
});

export type SubscriptionsResponse = z.infer<typeof subscriptionsResponseSchema>;

export const contractItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  contractType: z.string(),
  status: z.string(),
  monthlyCost: moneySchema.nullable(),
  annualCost: moneySchema.nullable(),
  renewalDate: z.string().nullable(),
  cancellationDeadline: z.string().nullable(),
  noticePeriodDays: z.number().nullable(),
  autoRenewal: z.boolean(),
});

export const contractsResponseSchema = z.object({
  asOf: z.string(),
  items: z.array(contractItemSchema),
});

export type ContractsResponse = z.infer<typeof contractsResponseSchema>;

export const sinkingFundSchema = z.object({
  id: z.string(),
  name: z.string(),
  target: moneySchema,
  currentReserved: moneySchema,
  monthlyContribution: moneySchema,
  remaining: moneySchema,
  percentComplete: z.number(),
  targetDate: z.string().nullable(),
  priority: z.number(),
});

export const goalItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  goalType: z.string(),
  status: z.string(),
  target: moneySchema,
  current: moneySchema,
  remaining: moneySchema,
  percentComplete: z.number(),
  monthlyContribution: moneySchema,
  requiredMonthly: moneySchema,
  targetDate: z.string().nullable(),
  priority: z.number(),
});

export const goalsResponseSchema = z.object({
  asOf: z.string(),
  goals: z.array(goalItemSchema),
  sinkingFunds: z.array(sinkingFundSchema),
});

export type GoalsResponse = z.infer<typeof goalsResponseSchema>;
