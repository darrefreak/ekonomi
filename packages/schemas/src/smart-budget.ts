import { z } from "zod";

/**
 * Smart Budget — the default budgeting experience.
 *
 * Six conceptual groups instead of fifty categories. Every suggested amount is
 * deterministic and carries its own basis (12-month median, latest 3 months,
 * seasonal factor) so the UI can answer "Varför detta belopp?" without a model
 * in the loop. The user's adopted plan is stored per month; the suggestion is
 * recomputed from history every time.
 */

export const smartBudgetGroupKeySchema = z.enum([
  "essential_fixed",
  "essential_variable",
  "irregular",
  "flexible",
  "goals",
  "savings",
]);
export type SmartBudgetGroupKey = z.infer<typeof smartBudgetGroupKeySchema>;

export const smartBudgetBasisSchema = z.object({
  /** Monthly median across the full observed window (up to 24 complete months). */
  median12Minor: z.string().nullable(),
  /** Average of the latest 3 complete months. */
  latest3Minor: z.string().nullable(),
  /** Seasonal factor for the target calendar month, 1 = neutral. */
  seasonalFactor: z.number().nullable(),
  monthsObserved: z.number(),
  /** Human explanation fragments, already formatted. */
  notes: z.array(z.string()),
});
export type SmartBudgetBasis = z.infer<typeof smartBudgetBasisSchema>;

export const smartBudgetContributorSchema = z.object({
  /** What the row is: a recurring stream, a category, a goal or a fund. */
  kind: z.enum(["recurring", "category", "goal", "sinking_fund", "policy"]),
  name: z.string(),
  monthlyMinor: z.string(),
  href: z.string().nullable(),
});
export type SmartBudgetContributor = z.infer<typeof smartBudgetContributorSchema>;

export const smartBudgetGroupSchema = z.object({
  key: smartBudgetGroupKeySchema,
  name: z.string(),
  description: z.string(),
  suggestedMinor: z.string(),
  /** The adopted amount when the household has saved a plan for the month. */
  plannedMinor: z.string().nullable(),
  /** Spent so far in the target month (0 for future months). */
  actualMinor: z.string(),
  /** Deterministic month-end projection: actual + remaining expectation. */
  forecastMinor: z.string(),
  basis: smartBudgetBasisSchema,
  contributors: z.array(smartBudgetContributorSchema),
});
export type SmartBudgetGroup = z.infer<typeof smartBudgetGroupSchema>;

export const smartBudgetResponseSchema = z.object({
  asOf: z.string(),
  currency: z.string(),
  /** Target month YYYY-MM. */
  month: z.string(),
  monthsOfHistory: z.number(),
  /** Expected month income (12m median of complete months). */
  expectedIncomeMinor: z.string(),
  groups: z.array(smartBudgetGroupSchema),
  /**
   * "Kvar att använda" — flexible capacity after essentials, irregular
   * reservations, goals and the savings plan. Distinct from account balance.
   */
  flex: z.object({
    suggestedMinor: z.string(),
    plannedMinor: z.string().nullable(),
    /** Remaining right now for the in-progress month: planned − actual flexible spend. */
    remainingMinor: z.string().nullable(),
    explanation: z.array(z.string()),
  }),
  /** Whether the household has adopted a plan for this month. */
  adopted: z.boolean(),
  adoptedAt: z.string().nullable(),
});
export type SmartBudgetResponse = z.infer<typeof smartBudgetResponseSchema>;

export const smartBudgetQuerySchema = z.object({
  householdId: z.string().uuid(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});
export type SmartBudgetQuery = z.infer<typeof smartBudgetQuerySchema>;

export const adoptSmartBudgetSchema = z
  .object({
    householdId: z.string().uuid(),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    lines: z
      .array(
        z.object({
          key: smartBudgetGroupKeySchema,
          plannedMinor: z.string().regex(/^\d+$/),
        }),
      )
      .min(1),
  })
  .strict();
export type AdoptSmartBudgetInput = z.infer<typeof adoptSmartBudgetSchema>;
