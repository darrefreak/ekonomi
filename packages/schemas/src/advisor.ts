import { z } from "zod";
import { moneySchema } from "./money";

export const advisorCitationSchema = z.object({
  tool: z.string(),
  label: z.string(),
  href: z.string().optional(),
  value: z.string().optional(),
});
export type AdvisorCitation = z.infer<typeof advisorCitationSchema>;

export const advisorToolTraceSchema = z.object({
  tool: z.string(),
  ok: z.boolean(),
  data: z.record(z.unknown()),
});

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
      citations: z.array(advisorCitationSchema).optional().default([]),
    }),
  ),
  toolTrace: z.array(advisorToolTraceSchema),
  availableTools: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        readOnly: z.literal(true),
      }),
    )
    .optional()
    .default([]),
});
export type AdvisorBriefResponse = z.infer<typeof advisorBriefResponseSchema>;

export const advisorChatRequestSchema = z
  .object({
    householdId: z.string().uuid(),
    message: z.string().min(1).max(2000),
  })
  .strict();
export type AdvisorChatInput = z.input<typeof advisorChatRequestSchema>;

export const advisorChatResponseSchema = z.object({
  asOf: z.string(),
  reply: z.string(),
  citations: z.array(advisorCitationSchema),
  toolTrace: z.array(advisorToolTraceSchema),
  usedTools: z.array(z.string()),
});
export type AdvisorChatResponse = z.infer<typeof advisorChatResponseSchema>;

export const featureFlagSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  description: z.string().nullable().optional(),
});
export const featureFlagsResponseSchema = z.array(featureFlagSchema);
export type FeatureFlagsResponse = z.infer<typeof featureFlagsResponseSchema>;

export const recommendationOutcomeSchema = z.object({
  id: z.string().uuid(),
  recommendationKey: z.string(),
  title: z.string(),
  status: z.string(),
  expectedImpact: moneySchema.nullable().optional(),
  verifiedImpact: moneySchema.nullable().optional(),
  verificationStatus: z
    .enum(["AWAITING_EVIDENCE", "VERIFIED", "UNVERIFIABLE"])
    .optional(),
  verificationNotes: z.string().nullable().optional(),
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
