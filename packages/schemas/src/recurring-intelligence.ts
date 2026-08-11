import { z } from "zod";

/**
 * Recurring streams, subscriptions, price intelligence and expected
 * transactions — the persisted output of the deterministic recurrence engine.
 *
 * Cadence answers WHEN (EVERY_4_WEEKS is 13 payments a year, never mapped to
 * MONTHLY); recurring type answers WHAT KIND. Amounts are exact minor units
 * carried as strings.
 */

export const recurringStreamCadenceSchema = z.enum([
  "WEEKLY",
  "BIWEEKLY",
  "EVERY_4_WEEKS",
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "ANNUAL",
  "YEARLY",
  "VARIABLE_RECURRING",
]);
export type RecurringStreamCadence = z.infer<typeof recurringStreamCadenceSchema>;

export const recurringTypeSchema = z.enum([
  "SUBSCRIPTION",
  "UTILITY_BILL",
  "INSURANCE",
  "MORTGAGE",
  "LOAN_PAYMENT",
  "SALARY",
  "BENEFIT",
  "TELECOM",
  "MEMBERSHIP",
  "CHILDCARE",
  "ANNUAL_BILL",
  "VARIABLE_RECURRING",
  "OTHER_RECURRING",
  "UNKNOWN_RECURRING",
]);
export type RecurringType = z.infer<typeof recurringTypeSchema>;

export const recurringGroupKeySchema = z.enum([
  "subscriptions",
  "housing_debt",
  "utilities",
  "insurance",
  "income",
  "other",
]);
export type RecurringGroupKey = z.infer<typeof recurringGroupKeySchema>;

export const storedPriceChangeSchema = z.object({
  fromMinor: z.string(),
  toMinor: z.string(),
  changedOn: z.string(),
  differenceMinor: z.string(),
  percentChange: z.number().nullable(),
});
export type StoredPriceChangeJson = z.infer<typeof storedPriceChangeSchema>;

export const recurringStreamSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  merchantName: z.string().nullable(),
  /** False for manually created rows the detector never touched. */
  detected: z.boolean(),
  direction: z.enum(["INFLOW", "OUTFLOW"]),
  cadence: recurringStreamCadenceSchema,
  recurringType: z.string(),
  isSubscription: z.boolean(),
  userMarkedSubscription: z.boolean().nullable(),
  status: z.enum(["DETECTED", "CONFIRMED", "DISMISSED", "PAUSED"]),
  userVerified: z.boolean(),
  /** 0–1. */
  confidence: z.number().nullable(),
  occurrenceCount: z.number(),
  firstSeenOn: z.string().nullable(),
  lastSeenOn: z.string().nullable(),
  nextExpectedOn: z.string().nullable(),
  currentAmountMinor: z.string(),
  medianAmountMinor: z.string().nullable(),
  minAmountMinor: z.string().nullable(),
  maxAmountMinor: z.string().nullable(),
  amountStable: z.boolean(),
  monthlyEquivalentMinor: z.string().nullable(),
  annualMinor: z.string().nullable(),
  currency: z.string(),
  priceChanges: z.array(storedPriceChangeSchema),
  originalAmountMinor: z.string().nullable(),
  annualPriceImpactMinor: z.string().nullable(),
  evidence: z.array(z.string()),
  medianIntervalDays: z.number().nullable(),
  intervalSpreadDays: z.number().nullable(),
  group: recurringGroupKeySchema,
});
export type RecurringStream = z.infer<typeof recurringStreamSchema>;

export const recurringReviewTypeSchema = z.enum([
  "POSSIBLE_RECURRING",
  "POSSIBLE_SUBSCRIPTION",
  "UNCERTAIN_CADENCE",
  "PRICE_CHANGE_UNCERTAIN",
]);
export type RecurringReviewType = z.infer<typeof recurringReviewTypeSchema>;

export const recurringReviewItemSchema = z.object({
  recurringId: z.string().uuid(),
  reviewType: recurringReviewTypeSchema,
  name: z.string(),
  cadence: recurringStreamCadenceSchema,
  confidence: z.number(),
  occurrenceCount: z.number(),
  medianAmountMinor: z.string().nullable(),
  currency: z.string(),
  question: z.string(),
});
export type RecurringReviewItem = z.infer<typeof recurringReviewItemSchema>;

export const priceInsightItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  fromMinor: z.string(),
  toMinor: z.string(),
  changedOn: z.string(),
  annualImpactMinor: z.string(),
  percentChange: z.number().nullable(),
});
export type PriceInsightItem = z.infer<typeof priceInsightItemSchema>;

export const recurringOverviewResponseSchema = z.object({
  asOf: z.string(),
  totals: z.object({
    recurringExpensesMonthlyMinor: z.string(),
    recurringExpensesAnnualMinor: z.string(),
    recurringIncomeMonthlyMinor: z.string(),
    recurringIncomeAnnualMinor: z.string(),
    subscriptionsMonthlyMinor: z.string(),
    subscriptionsAnnualMinor: z.string(),
    variableStreamsExcluded: z.number(),
  }),
  counts: z.object({
    streams: z.number(),
    subscriptions: z.number(),
    expenseStreams: z.number(),
    incomeStreams: z.number(),
    reviewItems: z.number(),
  }),
  priceInsights: z.object({
    increasedStreams: z.number(),
    annualIncreaseMinor: z.string(),
    items: z.array(priceInsightItemSchema),
  }),
  groups: z.array(
    z.object({
      key: recurringGroupKeySchema,
      label: z.string(),
      streams: z.array(recurringStreamSchema),
    }),
  ),
  review: z.array(recurringReviewItemSchema),
});
export type RecurringOverviewResponse = z.infer<typeof recurringOverviewResponseSchema>;

export const verifyRecurringStreamSchema = z
  .object({
    householdId: z.string().uuid(),
    /** Recurring or not. Omit to leave the status untouched. */
    status: z.enum(["CONFIRMED", "DISMISSED"]).optional(),
    /** Subscription or not. Omit to leave the detector's answer in force. */
    isSubscription: z.boolean().optional(),
  })
  .strict();
export type VerifyRecurringStreamInput = z.input<typeof verifyRecurringStreamSchema>;

export const expectedTransactionItemSchema = z.object({
  id: z.string().uuid(),
  recurringItemId: z.string().uuid(),
  name: z.string(),
  recurringType: z.string(),
  isSubscription: z.boolean(),
  expectedFrom: z.string(),
  expectedTo: z.string(),
  expectedAmountMinor: z.string(),
  expectedLowMinor: z.string(),
  expectedHighMinor: z.string(),
  currency: z.string(),
  direction: z.enum(["INFLOW", "OUTFLOW"]),
  confidence: z.number().nullable(),
  status: z.enum(["PENDING", "FULFILLED", "MISSED"]),
  matchedOn: z.string().nullable(),
});
export type ExpectedTransactionItem = z.infer<typeof expectedTransactionItemSchema>;

export const expectedTransactionsResponseSchema = z.object({
  asOf: z.string(),
  upcoming: z.array(expectedTransactionItemSchema),
  missing: z.array(expectedTransactionItemSchema.extend({ message: z.string() })),
  recentlyFulfilled: z.array(expectedTransactionItemSchema),
});
export type ExpectedTransactionsResponse = z.infer<
  typeof expectedTransactionsResponseSchema
>;
