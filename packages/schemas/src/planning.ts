import { z } from "zod";
import { moneySchema } from "./money";

const minorString = z.string().regex(/^-?\d+$/);
const positiveMinorString = z.string().regex(/^[1-9]\d*$/);

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

export const updateBudgetLineSchema = z.object({
  householdId: z.string().uuid(),
  plannedMinor: minorString,
});
export type UpdateBudgetLineInput = z.infer<typeof updateBudgetLineSchema>;

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
  sinkingFundId: z.string().uuid().nullable().optional(),
});

export const goalsResponseSchema = z.object({
  asOf: z.string(),
  goals: z.array(goalItemSchema),
  sinkingFunds: z.array(sinkingFundSchema),
});

export type GoalsResponse = z.infer<typeof goalsResponseSchema>;
export type GoalItem = z.infer<typeof goalItemSchema>;
export type SinkingFundItem = z.infer<typeof sinkingFundSchema>;

export const contributeGoalSchema = z.object({
  householdId: z.string().uuid(),
  amountMinor: positiveMinorString,
  note: z.string().max(500).optional().nullable(),
  contributedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type ContributeGoalInput = z.infer<typeof contributeGoalSchema>;

export const updateGoalSchema = z.object({
  householdId: z.string().uuid(),
  name: z.string().min(1).max(160).optional(),
  targetMinor: minorString.optional(),
  monthlyContributionMinor: minorString.optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]).optional(),
  priority: z.number().int().min(1).max(5).optional(),
});
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const createGoalSchema = z.object({
  householdId: z.string().uuid(),
  name: z.string().min(1).max(160),
  goalType: z
    .enum([
      "EMERGENCY_FUND",
      "INVESTMENT_TARGET",
      "DEBT_FREE",
      "HOME_PURCHASE",
      "CAR",
      "TRAVEL",
      "EDUCATION",
      "CUSTOM",
    ])
    .optional()
    .default("CUSTOM"),
  targetMinor: minorString,
  currentMinor: minorString.optional().default("0"),
  monthlyContributionMinor: minorString.optional().default("0"),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  priority: z.number().int().min(1).max(5).optional().default(3),
  sinkingFundId: z.string().uuid().nullable().optional(),
});
export type CreateGoalInput = z.input<typeof createGoalSchema>;

export const contributeSinkingFundSchema = z.object({
  householdId: z.string().uuid(),
  amountMinor: positiveMinorString,
  note: z.string().max(500).optional().nullable(),
  contributedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type ContributeSinkingFundInput = z.infer<typeof contributeSinkingFundSchema>;

export const updateSinkingFundSchema = z.object({
  householdId: z.string().uuid(),
  name: z.string().min(1).max(160).optional(),
  targetMinor: minorString.optional(),
  monthlyContributionMinor: minorString.optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  priority: z.number().int().min(1).max(5).optional(),
});
export type UpdateSinkingFundInput = z.infer<typeof updateSinkingFundSchema>;

export const createSinkingFundSchema = z.object({
  householdId: z.string().uuid(),
  name: z.string().min(1).max(160),
  targetMinor: minorString,
  currentReservedMinor: minorString.optional().default("0"),
  monthlyContributionMinor: minorString.optional().default("0"),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  priority: z.number().int().min(1).max(5).optional().default(3),
  categoryKey: z.string().max(80).nullable().optional(),
});
export type CreateSinkingFundInput = z.input<typeof createSinkingFundSchema>;
