import { z } from "zod";
import {
  amountMinorStringSchema,
  isoDateSchema,
  nonNegativeAmountMinorStringSchema,
  positiveAmountMinorStringSchema,
} from "./common";
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

export const budgetGroupSuggestionSchema = z.object({
  categoryKey: z.string(),
  name: z.string(),
  sortOrder: z.number(),
});

export const budgetResponseSchema = z.object({
  /**
   * False for a household that has not made a budget yet. The rest of the
   * response is still present and zeroed, so the surface renders an empty state
   * to act on rather than an error.
   */
  hasBudget: z.boolean().optional().default(true),
  asOf: z.string(),
  period: z
    .object({
      id: z.string(),
      label: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      status: z.string(),
    })
    .nullable(),
  currency: z.enum(["SEK", "EUR", "USD", "NOK", "DKK"]),
  totals: z.object({
    planned: moneySchema,
    actual: moneySchema,
    remaining: moneySchema,
    variance: moneySchema,
    utilizationPercent: z.number(),
  }),
  lines: z.array(budgetLineSchema),
  suggestedGroups: z.array(budgetGroupSuggestionSchema).optional().default([]),
});

export type BudgetResponse = z.infer<typeof budgetResponseSchema>;

export const createBudgetSchema = z
  .object({
    householdId: z.string().uuid(),
    /** `YYYY-MM`; defaults to the household's current month. */
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Ange månad som YYYY-MM")
      .optional(),
    template: z.enum(["SIMPLE"]).optional(),
    /** Overrides the template when supplied. */
    lines: z
      .array(
        z.object({
          categoryKey: z.string().min(1).max(80),
          name: z.string().min(1).max(120),
          plannedMinor: nonNegativeAmountMinorStringSchema,
        }),
      )
      .max(50)
      .optional(),
  })
  .strict();
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;

export const updateBudgetLineSchema = z
  .object({
    householdId: z.string().uuid(),
    plannedMinor: nonNegativeAmountMinorStringSchema,
  })
  .strict();
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

export const updateRecurringStatusSchema = z
  .object({
    householdId: z.string().uuid(),
    status: z.enum(["CONFIRMED", "DISMISSED", "PAUSED", "DETECTED"]),
  })
  .strict();
export type UpdateRecurringStatusInput = z.infer<typeof updateRecurringStatusSchema>;

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

export const contributeGoalSchema = z
  .object({
    householdId: z.string().uuid(),
    amountMinor: positiveAmountMinorStringSchema,
    note: z.string().max(500).optional().nullable(),
    contributedOn: isoDateSchema.optional(),
  })
  .strict();
export type ContributeGoalInput = z.infer<typeof contributeGoalSchema>;

export const updateGoalSchema = z
  .object({
    householdId: z.string().uuid(),
    name: z.string().min(1).max(160).optional(),
    targetMinor: amountMinorStringSchema.optional(),
    monthlyContributionMinor: amountMinorStringSchema.optional(),
    targetDate: isoDateSchema.nullable().optional(),
    status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]).optional(),
    priority: z.number().int().min(1).max(5).optional(),
  })
  .strict();
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const createGoalSchema = z
  .object({
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
    targetMinor: positiveAmountMinorStringSchema,
    currentMinor: nonNegativeAmountMinorStringSchema.optional().default("0"),
    monthlyContributionMinor: nonNegativeAmountMinorStringSchema
      .optional()
      .default("0"),
    targetDate: isoDateSchema.nullable().optional(),
    priority: z.number().int().min(1).max(5).optional().default(3),
    sinkingFundId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type CreateGoalInput = z.input<typeof createGoalSchema>;

export const contributeSinkingFundSchema = z
  .object({
    householdId: z.string().uuid(),
    amountMinor: positiveAmountMinorStringSchema,
    note: z.string().max(500).optional().nullable(),
    contributedOn: isoDateSchema.optional(),
  })
  .strict();
export type ContributeSinkingFundInput = z.infer<typeof contributeSinkingFundSchema>;

export const updateSinkingFundSchema = z
  .object({
    householdId: z.string().uuid(),
    name: z.string().min(1).max(160).optional(),
    targetMinor: amountMinorStringSchema.optional(),
    monthlyContributionMinor: amountMinorStringSchema.optional(),
    targetDate: isoDateSchema.nullable().optional(),
    priority: z.number().int().min(1).max(5).optional(),
  })
  .strict();
export type UpdateSinkingFundInput = z.infer<typeof updateSinkingFundSchema>;

export const createSinkingFundSchema = z
  .object({
    householdId: z.string().uuid(),
    name: z.string().min(1).max(160),
    targetMinor: positiveAmountMinorStringSchema,
    currentReservedMinor: nonNegativeAmountMinorStringSchema
      .optional()
      .default("0"),
    monthlyContributionMinor: nonNegativeAmountMinorStringSchema
      .optional()
      .default("0"),
    targetDate: isoDateSchema.nullable().optional(),
    priority: z.number().int().min(1).max(5).optional().default(3),
    categoryKey: z.string().max(80).nullable().optional(),
  })
  .strict();
export type CreateSinkingFundInput = z.input<typeof createSinkingFundSchema>;
