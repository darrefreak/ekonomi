import { z } from "zod";

/**
 * Cluster-level Needs Review and learned household classification rules.
 *
 * A review item here is one unresolved merchant cluster, not one transaction:
 * 217 unknown transactions in 6 clusters are 6 questions, not 217.
 */

export const clusterReviewTypeSchema = z.enum([
  "UNKNOWN_MERCHANT",
  "UNKNOWN_CATEGORY",
  "LOW_CLASSIFICATION_CONFIDENCE",
]);
export type ClusterReviewType = z.infer<typeof clusterReviewTypeSchema>;

export const clusterReviewItemSchema = z.object({
  id: z.string().uuid(),
  reviewType: clusterReviewTypeSchema,
  status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]),
  representativeDescription: z.string(),
  exampleDescriptions: z.array(z.string()),
  transactionCount: z.number(),
  firstSeen: z.string().nullable(),
  lastSeen: z.string().nullable(),
  direction: z.enum(["INFLOW", "OUTFLOW"]),
  medianAmountMinor: z.string().nullable(),
  minAmountMinor: z.string().nullable(),
  maxAmountMinor: z.string().nullable(),
  totalAmountMinor: z.string().nullable(),
  currency: z.string(),
  merchantCandidate: z.string().nullable(),
  categoryCandidateId: z.string().uuid().nullable(),
  categoryCandidateName: z.string().nullable(),
  /** 0–1, from the candidate engine. Null when there is no candidate at all. */
  confidence: z.number().nullable(),
  classificationSource: z.string(),
  explanation: z.string(),
});
export type ClusterReviewItem = z.infer<typeof clusterReviewItemSchema>;

export const clusterReviewResponseSchema = z.object({
  total: z.number(),
  items: z.array(clusterReviewItemSchema),
});
export type ClusterReviewResponse = z.infer<typeof clusterReviewResponseSchema>;

export const resolveClusterSchema = z
  .object({
    householdId: z.string().uuid(),
    clusterId: z.string().uuid(),
    action: z.enum(["accept", "correct", "skip"]),
    /** Pick an existing merchant… */
    merchantId: z.string().uuid().optional(),
    /** …or name one; reused case-insensitively if the household already has it. */
    merchantName: z.string().trim().min(1).max(160).optional(),
    categoryId: z.string().uuid().optional(),
    /** "Kom ihåg detta för framtiden" — persist a household learned rule. */
    rememberRule: z.boolean().default(false),
  })
  .strict();
export type ResolveClusterInput = z.input<typeof resolveClusterSchema>;

export const resolveClusterResponseSchema = z.object({
  status: z.enum(["RESOLVED", "DISMISSED"]),
  transactionsUpdated: z.number(),
  ruleCreated: z.boolean(),
  remainingReviewCount: z.number(),
});
export type ResolveClusterResponse = z.infer<typeof resolveClusterResponseSchema>;

export const classificationRuleSchema = z.object({
  id: z.string().uuid(),
  ruleType: z.enum(["EXACT_SIGNATURE", "MERCHANT"]),
  matchValue: z.string(),
  merchantId: z.string().uuid().nullable(),
  merchantName: z.string().nullable(),
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  userVerified: z.boolean(),
  enabled: z.boolean(),
  matchCount: z.number(),
  lastMatchedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ClassificationRule = z.infer<typeof classificationRuleSchema>;

export const classificationRulesResponseSchema = z.object({
  total: z.number(),
  items: z.array(classificationRuleSchema),
});
export type ClassificationRulesResponse = z.infer<
  typeof classificationRulesResponseSchema
>;

export const updateClassificationRuleSchema = z
  .object({
    householdId: z.string().uuid(),
    enabled: z.boolean(),
  })
  .strict();
export type UpdateClassificationRuleInput = z.input<
  typeof updateClassificationRuleSchema
>;
