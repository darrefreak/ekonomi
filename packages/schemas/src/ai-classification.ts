import { z } from "zod";

/**
 * The external AI classification boundary.
 *
 * Everything the provider may return is constrained here, and everything the
 * system reports about AI work (dry-run, status, cost) is typed here. The
 * provider result schema is the contract §10 demands: UNKNOWN is an allowed
 * answer, invented category ids are not.
 */

/** Prompt version persisted with every result (§16). */
export const TRANSACTION_CLASSIFIER_PROMPT_VERSION = "transaction-classifier-v1";
/** Structured-output schema version persisted with every result (§17). */
export const AI_CLASSIFICATION_SCHEMA_VERSION = "ai-cls-1";

/**
 * Transaction types the model may propose. The high-risk subset never
 * auto-applies (§12); it can only become a review suggestion.
 */
export const aiTransactionTypeSchema = z.enum([
  "PURCHASE",
  "INCOME",
  "TRANSFER",
  "INVESTMENT",
  "CREDIT_CARD_PAYMENT",
  "LOAN_PRINCIPAL",
  "REFUND",
  "FEE",
  "UNKNOWN",
]);
export type AiTransactionType = z.infer<typeof aiTransactionTypeSchema>;

export const HIGH_RISK_TRANSACTION_TYPES: readonly AiTransactionType[] = [
  "TRANSFER",
  "INVESTMENT",
  "CREDIT_CARD_PAYMENT",
  "LOAN_PRINCIPAL",
  "REFUND",
];

export const aiRecurringTypeCandidateSchema = z.enum([
  "SUBSCRIPTION",
  "UTILITY_BILL",
  "INSURANCE",
  "RENT_OR_MORTGAGE",
  "SALARY",
  "OTHER_RECURRING",
]);

/** Bounded signal vocabulary the model may cite as evidence. */
export const aiClassificationSignalSchema = z.enum([
  "MERCHANT_NAME_IN_TEXT",
  "KNOWN_BRAND",
  "RECURRING_CADENCE",
  "AMOUNT_PATTERN",
  "DIRECTION",
  "CATEGORY_KEYWORD",
  "REFERENCE_ONLY",
  "AMBIGUOUS_TEXT",
]);

/**
 * One cluster's structured answer from the provider (§10).
 *
 * `categoryId`/`subcategoryId` must be ids from the allowed taxonomy the
 * request carried; anything else is rejected after validation (§11). The
 * schema itself cannot know the household's taxonomy, so that check lives in
 * the service.
 */
export const aiClusterClassificationSchema = z.object({
  /** Echo of the cluster reference in the request, never raw text. */
  clusterRef: z.string().min(1).max(64),
  merchantCandidate: z.string().trim().min(1).max(160).nullable(),
  merchantConfidence: z.number().min(0).max(1),
  categoryId: z.string().uuid().nullable(),
  subcategoryId: z.string().uuid().nullable(),
  transactionType: aiTransactionTypeSchema,
  recurringTypeCandidate: aiRecurringTypeCandidateSchema.nullable(),
  classificationConfidence: z.number().min(0).max(1),
  shortExplanation: z.string().max(300),
  signals: z.array(aiClassificationSignalSchema).max(8),
});
export type AiClusterClassification = z.infer<typeof aiClusterClassificationSchema>;

export const aiClassificationBatchResponseSchema = z.object({
  results: z.array(aiClusterClassificationSchema),
});
export type AiClassificationBatchResponse = z.infer<
  typeof aiClassificationBatchResponseSchema
>;

/** What the dry-run reports (§6). Counts only — no descriptions. */
export const aiDryRunReportSchema = z.object({
  householdId: z.string().uuid(),
  transactionsAnalyzed: z.number(),
  clustersTotal: z.number(),
  resolvedDeterministic: z.number(),
  resolvedLearnedRule: z.number(),
  resolvedUserVerified: z.number(),
  resolvedAi: z.number(),
  unresolvedClusters: z.number(),
  aiEligibleClusters: z.number(),
  opaqueExcluded: z.number(),
  cachedResults: z.number(),
  estimatedRequests: z.number(),
  estimatedPayloadBytes: z.number(),
  providerCallsMade: z.number(),
  dryRun: z.literal(true),
});
export type AiDryRunReport = z.infer<typeof aiDryRunReportSchema>;

/** Outcome of a real (or mocked) classification run (§22). */
export const aiClassificationRunReportSchema = z.object({
  householdId: z.string().uuid(),
  eligibleClusters: z.number(),
  cacheHits: z.number(),
  providerCalls: z.number(),
  applied: z.number(),
  suggested: z.number(),
  unknown: z.number(),
  rejected: z.number(),
  failed: z.number(),
  dryRun: z.boolean(),
  promptVersion: z.string(),
});
export type AiClassificationRunReport = z.infer<
  typeof aiClassificationRunReportSchema
>;

/** AI enablement + cost observability (§20, §50). */
export const aiStatusResponseSchema = z.object({
  householdId: z.string().uuid(),
  envEnabled: z.boolean(),
  householdEnabled: z.boolean(),
  dryRunForced: z.boolean(),
  providerConfigured: z.boolean(),
  /** All of the above combined: may a real external call happen right now? */
  externalCallsAllowed: z.boolean(),
  model: z.string().nullable(),
  promptVersion: z.string(),
  metrics: z.object({
    clustersSent: z.number(),
    requests: z.number(),
    cacheHits: z.number(),
    failures: z.number(),
    promptTokens: z.number(),
    completionTokens: z.number(),
    estimatedCostText: z.string().nullable(),
  }),
});
export type AiStatusResponse = z.infer<typeof aiStatusResponseSchema>;

/** AI suggestion attached to a Needs Review card (§24). */
export const aiReviewSuggestionSchema = z.object({
  merchantCandidate: z.string().nullable(),
  merchantConfidence: z.number().nullable(),
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  transactionType: aiTransactionTypeSchema.nullable(),
  /** Combined confidence, not raw model self-confidence. */
  confidence: z.number(),
  shortExplanation: z.string(),
  source: z.literal("AI_SUGGESTION"),
  createdAt: z.string(),
});
export type AiReviewSuggestion = z.infer<typeof aiReviewSuggestionSchema>;
