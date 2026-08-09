import { z } from "zod";

/** UUID entity / household identifiers. */
export const uuidSchema = z.string().uuid();

/** ISO calendar date YYYY-MM-DD (no time). */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ogiltigt datum (YYYY-MM-DD)")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d!));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m! - 1 &&
      dt.getUTCDate() === d
    );
  }, "Ogiltigt kalenderdatum");

/** Currency codes the domain can represent (must match domain CurrencyCode). */
export const currencyCodeSchema = z.enum(["SEK", "EUR", "USD", "NOK", "DKK"]);

/**
 * The currencies V1 can actually aggregate.
 *
 * Representing a currency and being able to total a household in it are
 * different capabilities: there is no FX engine, so a household's money must
 * all be in one currency and that currency must be one the product supports
 * end to end. Offering any other is a promise the figures cannot keep.
 *
 * See `docs/CURRENCY_POLICY.md`.
 */
export const AGGREGATION_CURRENCIES = ["SEK"] as const;
export const aggregationCurrencySchema = z.enum(AGGREGATION_CURRENCIES);
export type AggregationCurrency = (typeof AGGREGATION_CURRENCIES)[number];

/**
 * Minor-unit money as decimal digit string (optional leading minus).
 * Rejects floats, scientific notation, empty, and leading zeros (except "0").
 */
export const amountMinorStringSchema = z
  .string()
  .regex(/^-?(0|[1-9]\d*)$/, "Belopp måste vara ett heltalsvärde i öre");

/** Strictly positive minor amount (no zero, no sign). */
export const positiveAmountMinorStringSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "Belopp måste vara ett positivt heltalsvärde i öre");

/** Non-negative minor amount. */
export const nonNegativeAmountMinorStringSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, "Belopp måste vara ≥ 0 i öre");

/** Query schemas strip unknown keys (GET extras are common); bodies use .strict(). */
export const householdIdQuerySchema = z.object({
  householdId: uuidSchema,
});

export const householdAsOfQuerySchema = z.object({
  householdId: uuidSchema,
  asOf: isoDateSchema.optional(),
});

/** List/filter query bounds for household-scoped reads. */
export const paginationQuerySchema = z.object({
  householdId: uuidSchema,
  limit: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .transform((v) => (v == null ? 50 : Number(v)))
    .pipe(z.number().int().min(1).max(200)),
  q: z.string().max(200).optional(),
  accountId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  vehicleId: uuidSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  includeExcluded: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  includeArchived: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  cursor: z.string().max(200).optional(),
  sort: z
    .enum(["date_desc", "date_asc", "amount_desc", "amount_asc", "name_asc"])
    .optional(),
});

export type HouseholdIdQuery = z.infer<typeof householdIdQuerySchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Path param helpers — malformed IDs → clean VALIDATION_ERROR before repos. */
export const idParamSchema = z.object({ id: uuidSchema });
export const goalIdParamSchema = z.object({ goalId: uuidSchema });
export const fundIdParamSchema = z.object({ fundId: uuidSchema });
export const lineIdParamSchema = z.object({ lineId: uuidSchema });
export const scenarioIdParamSchema = z.object({ scenarioId: uuidSchema });
export const accountIdParamSchema = z.object({ accountId: uuidSchema });
export const anomalyIdParamSchema = z.object({ anomalyId: uuidSchema });
export const recurringIdParamSchema = z.object({ recurringId: uuidSchema });

export const searchQuerySchema = z.object({
  householdId: uuidSchema,
  q: z.string().max(200).optional().default(""),
});

export const reportsMonthlyQuerySchema = z.object({
  householdId: uuidSchema,
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "period måste vara YYYY-MM")
    .optional(),
  asOf: isoDateSchema.optional(),
});

export const reportsYearlyQuerySchema = z.object({
  householdId: uuidSchema,
  year: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .refine(
      (v) => v == null || (Number(v) >= 2000 && Number(v) <= 2100),
      "year måste vara 2000–2100",
    ),
  asOf: isoDateSchema.optional(),
});

export const vehicleMarketQuerySchema = z.object({
  householdId: uuidSchema,
  vehicleId: uuidSchema.optional(),
});

/** Basis points 0–10000 (= 0%–100%) unless domain allows higher. */
export const interestRateBpsSchema = z
  .number()
  .int()
  .min(0)
  .max(10_000);

/** Percentage 0–100 as number (not money). */
export const percent0to100Schema = z.number().min(0).max(100);

export const confidenceSchema = z.number().min(0).max(1);
