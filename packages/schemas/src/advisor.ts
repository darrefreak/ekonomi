import { z } from "zod";
import { moneySchema } from "./money";

export const advisorBriefResponseSchema = z.object({
  asOf: z.string(),
  briefId: z.string(),
  headline: z.string(),
  disclaimer: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      sourceTools: z.array(z.string()),
    }),
  ),
  toolTrace: z.array(
    z.object({
      tool: z.string(),
      ok: z.boolean(),
      data: z.record(z.unknown()),
    }),
  ),
});
export type AdvisorBriefResponse = z.infer<typeof advisorBriefResponseSchema>;

export const recommendationOutcomeSchema = z.object({
  id: z.string().uuid(),
  recommendationKey: z.string(),
  title: z.string(),
  status: z.string(),
  expectedImpact: moneySchema.nullable().optional(),
  shownAt: z.string(),
  notes: z.string().nullable(),
});

export const recommendationOutcomesResponseSchema = z.object({
  items: z.array(recommendationOutcomeSchema),
});
export type RecommendationOutcomesResponse = z.infer<
  typeof recommendationOutcomesResponseSchema
>;

export const updateRecommendationOutcomeSchema = z.object({
  householdId: z.string().uuid(),
  status: z.enum(["SHOWN", "OPENED", "ACCEPTED", "DISMISSED", "COMPLETED"]),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateRecommendationOutcomeInput = z.infer<
  typeof updateRecommendationOutcomeSchema
>;

export const trackRecommendationOutcomeSchema = z.object({
  householdId: z.string().uuid(),
  recommendationKey: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  expectedImpactMinor: z.string().regex(/^-?\d+$/).nullable().optional(),
  status: z
    .enum(["SHOWN", "OPENED", "ACCEPTED", "DISMISSED", "COMPLETED"])
    .optional()
    .default("SHOWN"),
  notes: z.string().max(2000).nullable().optional(),
});
export type TrackRecommendationOutcomeInput = z.infer<
  typeof trackRecommendationOutcomeSchema
>;
