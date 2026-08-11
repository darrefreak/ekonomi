import { z } from "zod";

/**
 * Financial Calendar — the merged forward view of money leaving and arriving.
 *
 * One underlying obligation appears exactly once: a subscription with a
 * scheduled next charge is not repeated as an expected recurring transaction,
 * and a future-dated actual transaction outranks the expectation it fulfils.
 * Every event carries a confidence class so the UI can honestly distinguish
 * what is KNOWN (a real dated row), EXPECTED (a detected recurring stream with
 * an amount band) and ESTIMATED (a deterministic fallback such as the salary
 * guess).
 */

export const calendarEventConfidenceSchema = z.enum([
  "KNOWN",
  "EXPECTED",
  "ESTIMATED",
]);
export type CalendarEventConfidence = z.infer<typeof calendarEventConfidenceSchema>;

export const calendarEventSourceSchema = z.enum([
  "FUTURE_TRANSACTION",
  "SUBSCRIPTION_CHARGE",
  "CONTRACT_RENEWAL",
  "EXPECTED_RECURRING",
  "SALARY_ESTIMATE",
  "GOAL_TARGET",
]);
export type CalendarEventSource = z.infer<typeof calendarEventSourceSchema>;

export const calendarEventSchema = z.object({
  id: z.string(),
  source: calendarEventSourceSchema,
  confidence: calendarEventConfidenceSchema,
  title: z.string(),
  direction: z.enum(["INFLOW", "OUTFLOW"]),
  /** Signed minor units: negative for outflows, positive for inflows. */
  amountMinor: z.string(),
  /** Amount band for EXPECTED events (signed, same convention). */
  lowMinor: z.string().nullable(),
  highMinor: z.string().nullable(),
  date: z.string(),
  /** Expectation window when the exact day is not known. */
  windowFrom: z.string().nullable(),
  windowTo: z.string().nullable(),
  recurringId: z.string().nullable(),
  transactionId: z.string().nullable(),
  /** Drill-down target inside the product. */
  href: z.string().nullable(),
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const calendarDaySchema = z.object({
  date: z.string(),
  events: z.array(calendarEventSchema),
  /** Net signed change for the day (point estimates). */
  netMinor: z.string(),
  /** Projected accessible cash at the end of the day. */
  projectedCashMinor: z.string(),
});
export type CalendarDay = z.infer<typeof calendarDaySchema>;

const windowSummarySchema = z.object({
  days: z.number(),
  inflowMinor: z.string(),
  outflowMinor: z.string(),
  netMinor: z.string(),
  endProjectedCashMinor: z.string(),
  eventCount: z.number(),
});

export const calendarResponseSchema = z.object({
  asOf: z.string(),
  currency: z.string(),
  horizonDays: z.number(),
  startingCashMinor: z.string(),
  days: z.array(calendarDaySchema),
  summaries: z.object({
    "7": windowSummarySchema,
    "30": windowSummarySchema,
    "60": windowSummarySchema,
    "90": windowSummarySchema,
  }),
  /** The tightest day within the horizon — the planning headline. */
  lowestPoint: z
    .object({ date: z.string(), projectedCashMinor: z.string() })
    .nullable(),
  /** How the projection is produced, for the explainability surface. */
  method: z.array(z.string()),
});
export type CalendarResponse = z.infer<typeof calendarResponseSchema>;

export const calendarQuerySchema = z.object({
  householdId: z.string().uuid(),
  days: z.coerce.number().int().min(7).max(120).optional().default(90),
});
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
