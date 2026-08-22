import { z } from "zod";

/**
 * Family summary: the household's finances answered as three plain questions —
 * "vart tar pengarna vägen?", "sparar vi tillräckligt?" and "vad bör vi göra?".
 *
 * Every number in here is produced by the deterministic engines (brief
 * findings, liquidity/savings targets, opportunities). This contract only
 * carries display-ready values and the research-based benchmark each section
 * is measured against; it never asks the client to compute money.
 */

export const familySummaryStatusSchema = z.enum(["good", "watch", "act"]);
export type FamilySummaryStatus = z.infer<typeof familySummaryStatusSchema>;

export const familySummaryRowSchema = z.object({
  label: z.string(),
  /** Preformatted, e.g. "1 200 kr/år" or "3,2 mån". Null when not a figure. */
  amountText: z.string().nullable(),
  /** Whether the figure reads as a problem, a win, or neutral. */
  tone: z.enum(["positive", "negative", "neutral"]).default("neutral"),
  /** Where the underlying evidence lives. */
  href: z.string(),
});
export type FamilySummaryRow = z.infer<typeof familySummaryRowSchema>;

export const familySummarySectionSchema = z.object({
  key: z.enum(["waste", "saving", "action"]),
  title: z.string(),
  status: familySummaryStatusSchema,
  /** One plain sentence a family can read in a second. */
  summary: z.string(),
  /** Headline figure for the section, preformatted. */
  metricLabel: z.string().nullable(),
  metricValue: z.string().nullable(),
  /** Research-based benchmark the section is judged against. */
  benchmark: z.string().nullable(),
  rows: z.array(familySummaryRowSchema),
  /** Primary action for the section. */
  ctaLabel: z.string().nullable(),
  ctaHref: z.string().nullable(),
});
export type FamilySummarySection = z.infer<typeof familySummarySectionSchema>;

export const familySummaryResponseSchema = z.object({
  householdId: z.string().uuid(),
  asOf: z.string(),
  greeting: z.string(),
  /** One-line overall status, honest about severity. */
  headline: z.string(),
  /** 2–5 grounded sentences that read as a short story about the month. */
  narrative: z.array(z.string()),
  /** Whether AI wrote the narrative, and a user-safe status line either way. */
  aiStatus: z.object({
    enabled: z.boolean(),
    message: z.string(),
  }),
  sections: z.object({
    waste: familySummarySectionSchema,
    saving: familySummarySectionSchema,
    action: familySummarySectionSchema,
  }),
  /** True when there is too little data to answer confidently. */
  lowData: z.boolean(),
});
export type FamilySummaryResponse = z.infer<typeof familySummaryResponseSchema>;
