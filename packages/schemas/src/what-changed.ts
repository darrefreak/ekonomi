import { z } from "zod";

/**
 * "Vad har förändrats?" — spending change decomposition between two periods.
 *
 * The comparison is always between two explicit, labeled windows; nothing is
 * silently mixed. One-off purchases are surfaced separately but stated as
 * included in the totals, so the reader can mentally remove them without the
 * numbers ever disagreeing with the ledger.
 */

export const whatChangedModeSchema = z.enum([
  "vs_baseline",
  "vs_previous_month",
  "vs_same_month_last_year",
  "3m_vs_12m",
  "ytd_vs_previous_year",
]);
export type WhatChangedMode = z.infer<typeof whatChangedModeSchema>;

const periodSchema = z.object({
  label: z.string(),
  from: z.string(),
  to: z.string(),
  /** Number of complete months the window covers (for per-month normalisation). */
  months: z.number(),
  incomeMinor: z.string(),
  expenseMinor: z.string(),
});

export const whatChangedDriverSchema = z.object({
  kind: z.enum(["category", "merchant"]),
  key: z.string(),
  name: z.string(),
  /** Per-month normalised amounts so unequal windows compare honestly. */
  currentMinor: z.string(),
  referenceMinor: z.string(),
  changeMinor: z.string(),
  percentChange: z.number().nullable(),
  href: z.string().nullable(),
});
export type WhatChangedDriver = z.infer<typeof whatChangedDriverSchema>;

export const whatChangedOneOffSchema = z.object({
  transactionId: z.string(),
  description: z.string(),
  amountMinor: z.string(),
  date: z.string(),
  categoryName: z.string().nullable(),
  merchantName: z.string().nullable(),
});
export type WhatChangedOneOff = z.infer<typeof whatChangedOneOffSchema>;

export const whatChangedResponseSchema = z.object({
  asOf: z.string(),
  currency: z.string(),
  mode: whatChangedModeSchema,
  current: periodSchema,
  reference: periodSchema,
  /** Per-month normalised change in total spending (current − reference). */
  expenseChangeMinor: z.string(),
  incomeChangeMinor: z.string(),
  savingsChangeMinor: z.string(),
  expenseChangePercent: z.number().nullable(),
  categoryDrivers: z.array(whatChangedDriverSchema),
  merchantDrivers: z.array(whatChangedDriverSchema),
  oneOffs: z.object({
    /** One-offs are part of the totals above; this only isolates them. */
    includedInTotals: z.literal(true),
    thresholdMinor: z.string(),
    items: z.array(whatChangedOneOffSchema),
    totalMinor: z.string(),
  }),
  explanation: z.array(z.string()),
});
export type WhatChangedResponse = z.infer<typeof whatChangedResponseSchema>;

export const whatChangedQuerySchema = z.object({
  householdId: z.string().uuid(),
  mode: whatChangedModeSchema.optional().default("vs_baseline"),
});
export type WhatChangedQuery = z.infer<typeof whatChangedQuerySchema>;
