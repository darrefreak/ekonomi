import { z } from "zod";
import { isoDateSchema, uuidSchema } from "./common";

const householdIdOrSystem = z.union([uuidSchema, z.literal("system")]);

/** Shared optional fields present on most job payloads. */
const jobCommonFields = {
  asOf: isoDateSchema.optional(),
  /** Free-text origin label for observability (e.g. "ledger.mutation", "cron", "manual"). */
  trigger: z.string().max(80).optional(),
  /** Caller-supplied idempotency key; falls back to a deterministic jobId when omitted. */
  idempotencyKey: z.string().max(200).optional(),
  calculationVersion: z.string().max(40).optional(),
  /** Optional subject entity (document id, integration source id, etc.). */
  entityId: uuidSchema.optional(),
};

export const healthCheckJobPayloadSchema = z
  .object({
    type: z.literal("HEALTH_CHECK"),
    householdId: householdIdOrSystem,
    ...jobCommonFields,
  })
  .strict();

export const reconcileAccountBalancesJobPayloadSchema = z
  .object({
    type: z.literal("RECONCILE_ACCOUNT_BALANCES"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

export const calculateMetricsJobPayloadSchema = z
  .object({
    type: z.literal("CALCULATE_METRICS"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

export const calculateNetWorthJobPayloadSchema = z
  .object({
    type: z.literal("CALCULATE_NET_WORTH"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

export const generateForecastJobPayloadSchema = z
  .object({
    type: z.literal("GENERATE_FORECAST"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

export const generateOpportunitiesJobPayloadSchema = z
  .object({
    type: z.literal("GENERATE_OPPORTUNITIES"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

export const runRiskAnalysisJobPayloadSchema = z
  .object({
    type: z.literal("RUN_RISK_ANALYSIS"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

export const runAnomalyAnalysisJobPayloadSchema = z
  .object({
    type: z.literal("RUN_ANOMALY_ANALYSIS"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

export const generateInsightsJobPayloadSchema = z
  .object({
    type: z.literal("GENERATE_INSIGHTS"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

export const generateAiBriefJobPayloadSchema = z
  .object({
    type: z.literal("GENERATE_AI_BRIEF"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

export const processDocumentJobPayloadSchema = z
  .object({
    type: z.literal("PROCESS_DOCUMENT"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

export const syncIntegrationJobPayloadSchema = z
  .object({
    type: z.literal("SYNC_INTEGRATION"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

/**
 * Commit a previewed bank-statement import.
 *
 * A five-year statement is thousands of rows and takes far longer than a request
 * should be held open, so confirmation enqueues this and the batch's own status
 * carries progress. `entityId` is the import batch.
 */
export const commitStatementImportJobPayloadSchema = z
  .object({
    type: z.literal("COMMIT_STATEMENT_IMPORT"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

/**
 * Recurring intelligence jobs (§38).
 *
 * DETECT_RECURRING_STREAMS covers detection *and* persistence: persistence is
 * detection's write phase, and a separate persist job would have to re-run
 * detection to know what to write.
 */
export const detectRecurringStreamsJobPayloadSchema = z
  .object({
    type: z.literal("DETECT_RECURRING_STREAMS"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

export const detectSubscriptionsJobPayloadSchema = z
  .object({
    type: z.literal("DETECT_SUBSCRIPTIONS"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

export const calculateRecurringPriceChangesJobPayloadSchema = z
  .object({
    type: z.literal("CALCULATE_RECURRING_PRICE_CHANGES"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

export const generateExpectedTransactionsJobPayloadSchema = z
  .object({
    type: z.literal("GENERATE_EXPECTED_TRANSACTIONS"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

export const matchExpectedTransactionsJobPayloadSchema = z
  .object({
    type: z.literal("MATCH_EXPECTED_TRANSACTIONS"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

export const detectMissingExpectedJobPayloadSchema = z
  .object({
    type: z.literal("DETECT_MISSING_EXPECTED"),
    householdId: uuidSchema,
    ...jobCommonFields,
  })
  .strict();

export const jobPayloadSchema = z.discriminatedUnion("type", [
  healthCheckJobPayloadSchema,
  reconcileAccountBalancesJobPayloadSchema,
  calculateMetricsJobPayloadSchema,
  calculateNetWorthJobPayloadSchema,
  generateForecastJobPayloadSchema,
  generateOpportunitiesJobPayloadSchema,
  runRiskAnalysisJobPayloadSchema,
  runAnomalyAnalysisJobPayloadSchema,
  generateInsightsJobPayloadSchema,
  generateAiBriefJobPayloadSchema,
  processDocumentJobPayloadSchema,
  syncIntegrationJobPayloadSchema,
  commitStatementImportJobPayloadSchema,
  detectRecurringStreamsJobPayloadSchema,
  detectSubscriptionsJobPayloadSchema,
  calculateRecurringPriceChangesJobPayloadSchema,
  generateExpectedTransactionsJobPayloadSchema,
  matchExpectedTransactionsJobPayloadSchema,
  detectMissingExpectedJobPayloadSchema,
]);

export type JobPayload = z.infer<typeof jobPayloadSchema>;
export type JobType = JobPayload["type"];
