import { z } from "zod";

/**
 * Financial Brief V2 (§33–§45).
 *
 * The brief is a validated pipeline product: deterministic findings, ranked
 * deterministically, rendered from Swedish templates whose numbers come from
 * the findings themselves. AI may rephrase prose; it may not touch a number,
 * and the response schema carries the provenance either way.
 */

export const financialFindingTypeSchema = z.enum([
  "SPENDING_ABOVE_BASELINE",
  "SPENDING_BELOW_BASELINE",
  "CATEGORY_INCREASE",
  "CATEGORY_DECREASE",
  "SUBSCRIPTION_PRICE_INCREASE",
  "NEW_SUBSCRIPTION",
  "MISSING_EXPECTED_INCOME",
  "UNUSUAL_TRANSACTION",
  "LIQUIDITY_SHORTFALL",
  "LIQUIDITY_SURPLUS",
  "SAVINGS_RATE_CHANGE",
  "RESERVE_INADEQUATE",
  "UPCOMING_LARGE_OBLIGATION",
  "DATA_COVERAGE_WARNING",
]);
export type FinancialFindingType = z.infer<typeof financialFindingTypeSchema>;

export const findingSeveritySchema = z.enum([
  "CRITICAL",
  "WARNING",
  "NOTICE",
  "POSITIVE",
]);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

export const financialFindingSchema = z.object({
  /** Stable within a brief; used for dedupe/explainability. */
  key: z.string(),
  type: financialFindingTypeSchema,
  severity: findingSeveritySchema,
  /** Absolute financial impact in minor units, as string. "0" when N/A. */
  impactMinor: z.string().regex(/^-?\d+$/),
  /** 0–1 deterministic confidence, degraded by coverage/freshness. */
  confidence: z.number().min(0).max(1),
  /**
   * The named numeric values behind the finding, already formatted for
   * display (e.g. "+14,1 %", "1 660 kr"). These are the only numbers the
   * final text may contain (§39–§40).
   */
  fragments: z.record(z.string()),
  /** Raw values for programmatic use; never rendered directly. */
  values: z.record(z.union([z.string(), z.number(), z.null()])),
  /** Route in the app that explains the finding ("Varför ser jag detta?"). */
  explainRoute: z.string(),
  /** Findings in the same group describe the same underlying issue (§44). */
  dedupeGroup: z.string(),
  asOf: z.string(),
  /** False when the underlying source data is too old for a current-state claim. */
  fresh: z.boolean(),
});
export type FinancialFindingJson = z.infer<typeof financialFindingSchema>;

export const briefItemSchema = z.object({
  findingKey: z.string(),
  type: financialFindingTypeSchema,
  severity: findingSeveritySchema,
  /** Final Swedish sentence. Template-rendered or AI prose that passed grounding. */
  text: z.string(),
  explainRoute: z.string(),
  explainLabel: z.string(),
});
export type BriefItem = z.infer<typeof briefItemSchema>;

export const financialBriefResponseSchema = z.object({
  briefId: z.string().uuid(),
  householdId: z.string().uuid(),
  asOf: z.string(),
  headline: z.string(),
  items: z.array(briefItemSchema),
  findings: z.array(financialFindingSchema),
  /** Total findings before ranking/suppression, for observability. */
  findingsConsidered: z.number(),
  generator: z.enum(["TEMPLATE", "AI"]),
  /** Set when generator is AI. */
  model: z.string().nullable(),
  templateVersion: z.string(),
  findingsVersion: z.string(),
  promptVersion: z.string().nullable(),
  inputHash: z.string(),
  /** True when this render reused a persisted snapshot (§45). */
  fromCache: z.boolean(),
  aiStatus: z.object({
    enabled: z.boolean(),
    /** Swedish user-facing status line, always safe to show (§50). */
    message: z.string(),
  }),
  createdAt: z.string(),
});
export type FinancialBriefResponse = z.infer<typeof financialBriefResponseSchema>;
