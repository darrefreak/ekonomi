import { z } from "zod";
import { nonNegativeAmountMinorStringSchema } from "./common";
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

/**
 * Debt payoff ordering.
 *
 * `avalanche` clears the most expensive debt (highest interest) first, which
 * minimises total interest paid. `snowball` clears the smallest balance first,
 * which produces quicker wins. The order is deterministic; the numbers come
 * from the ledger and the account's rate.
 */
export const debtPayoffMethodSchema = z.enum(["avalanche", "snowball"]);
export type DebtPayoffMethod = z.infer<typeof debtPayoffMethodSchema>;

export const debtPayoffQuerySchema = z.object({
  householdId: z.string().uuid(),
  method: debtPayoffMethodSchema.optional().default("avalanche"),
  asOf: z.string().optional(),
  extraMonthlyMinor: nonNegativeAmountMinorStringSchema.optional(),
});

export const debtPayoffItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  provider: z.string().nullable(),
  accountType: z.enum(["MORTGAGE", "LOAN", "CREDIT_CARD"]),
  /** 1 = pay this first. */
  priority: z.number().int(),
  outstanding: moneySchema,
  interestRateBps: z.number(),
  interestRatePercent: z.number(),
  /** True when the rate is a type-based assumption, not a confirmed figure. */
  assumedRate: z.boolean(),
  monthlyInterest: moneySchema,
  /** Share of the household's total interest cost this debt represents (0–1). */
  interestShare: z.number(),
  reason: z.string(),
});
export type DebtPayoffItem = z.infer<typeof debtPayoffItemSchema>;

export const debtPayoffResponseSchema = z.object({
  asOf: z.string(),
  currency: z.enum(["SEK", "EUR", "USD", "NOK", "DKK"]),
  method: debtPayoffMethodSchema,
  totals: z.object({
    outstanding: moneySchema,
    monthlyInterest: moneySchema,
  }),
  items: z.array(debtPayoffItemSchema),
  focus: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      reason: z.string(),
    })
    .nullable(),
  /** Present only when an extra monthly amount was supplied. */
  projection: z
    .object({
      extraMonthly: moneySchema,
      focusMonthsToClear: z.number().int().nullable(),
      focusInterestPaid: moneySchema,
      focusInterestSaved: moneySchema,
    })
    .nullable(),
  /** Whether any rate in the plan is assumed rather than confirmed. */
  hasAssumedRates: z.boolean(),
  method_notes: z.array(z.string()),
});
export type DebtPayoffResponse = z.infer<typeof debtPayoffResponseSchema>;
