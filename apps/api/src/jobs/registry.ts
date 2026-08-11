import type { JobsOptions } from "bullmq";
import {
  aiClassifyTransactionClustersJobPayloadSchema,
  calculateMetricsJobPayloadSchema,
  calculateRecurringPriceChangesJobPayloadSchema,
  commitStatementImportJobPayloadSchema,
  calculateNetWorthJobPayloadSchema,
  detectMissingExpectedJobPayloadSchema,
  detectRecurringStreamsJobPayloadSchema,
  detectSubscriptionsJobPayloadSchema,
  generateAiBriefJobPayloadSchema,
  generateExpectedTransactionsJobPayloadSchema,
  generateForecastJobPayloadSchema,
  generateInsightsJobPayloadSchema,
  generateOpportunitiesJobPayloadSchema,
  healthCheckJobPayloadSchema,
  matchExpectedTransactionsJobPayloadSchema,
  processDocumentJobPayloadSchema,
  reconcileAccountBalancesJobPayloadSchema,
  runAnomalyAnalysisJobPayloadSchema,
  runRiskAnalysisJobPayloadSchema,
  syncIntegrationJobPayloadSchema,
  type JobPayload,
  type JobType,
} from "@ffos/schemas";
import type { z } from "zod";

export type BackoffOptions = { type: "fixed" | "exponential"; delay: number };

export type JobDefinition<T extends JobPayload = JobPayload> = {
  type: T["type"];
  payloadSchema: z.ZodType<T>;
  /** BullMQ queue name — V1 uses a single shared queue for all job types. */
  queue: string;
  attempts: number;
  backoff: BackoffOptions;
  /** Soft execution budget — handlers should log a warning past this, not hard-kill. */
  timeoutMs?: number;
  /** Deterministic jobId for BullMQ-native dedupe/idempotency. */
  buildJobId: (payload: T) => string;
};

const QUEUE_NAME = "ffos-jobs";

function hourBucket(): string {
  return new Date().toISOString().slice(0, 13);
}

function defaultAsOfJobId(payload: {
  type: string;
  householdId: string;
  asOf?: string;
  idempotencyKey?: string;
  entityId?: string;
}): string {
  if (payload.idempotencyKey) return payload.idempotencyKey;
  const parts = [payload.type, payload.householdId, payload.asOf ?? "na"];
  if (payload.entityId) parts.push(payload.entityId);
  return parts.join(":");
}

export const jobRegistry: Record<JobType, JobDefinition> = {
  HEALTH_CHECK: {
    type: "HEALTH_CHECK",
    payloadSchema: healthCheckJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 1,
    backoff: { type: "fixed", delay: 1_000 },
    timeoutMs: 5_000,
    buildJobId: (p) => p.idempotencyKey ?? `health-${p.householdId}-${hourBucket()}`,
  },
  RECONCILE_ACCOUNT_BALANCES: {
    type: "RECONCILE_ACCOUNT_BALANCES",
    payloadSchema: reconcileAccountBalancesJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    timeoutMs: 30_000,
    buildJobId: (p) =>
      p.idempotencyKey ?? `reconcile-balances-${p.householdId}-${p.asOf ?? "auto"}`,
  },
  CALCULATE_METRICS: {
    type: "CALCULATE_METRICS",
    payloadSchema: calculateMetricsJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    timeoutMs: 30_000,
    buildJobId: defaultAsOfJobId,
  },
  CALCULATE_NET_WORTH: {
    type: "CALCULATE_NET_WORTH",
    payloadSchema: calculateNetWorthJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    timeoutMs: 30_000,
    buildJobId: defaultAsOfJobId,
  },
  GENERATE_FORECAST: {
    type: "GENERATE_FORECAST",
    payloadSchema: generateForecastJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    timeoutMs: 30_000,
    buildJobId: defaultAsOfJobId,
  },
  GENERATE_OPPORTUNITIES: {
    type: "GENERATE_OPPORTUNITIES",
    payloadSchema: generateOpportunitiesJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    timeoutMs: 45_000,
    buildJobId: defaultAsOfJobId,
  },
  RUN_RISK_ANALYSIS: {
    type: "RUN_RISK_ANALYSIS",
    payloadSchema: runRiskAnalysisJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    timeoutMs: 30_000,
    buildJobId: defaultAsOfJobId,
  },
  RUN_ANOMALY_ANALYSIS: {
    type: "RUN_ANOMALY_ANALYSIS",
    payloadSchema: runAnomalyAnalysisJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    timeoutMs: 30_000,
    buildJobId: defaultAsOfJobId,
  },
  GENERATE_INSIGHTS: {
    type: "GENERATE_INSIGHTS",
    payloadSchema: generateInsightsJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    timeoutMs: 30_000,
    buildJobId: defaultAsOfJobId,
  },
  GENERATE_AI_BRIEF: {
    type: "GENERATE_AI_BRIEF",
    payloadSchema: generateAiBriefJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 2,
    backoff: { type: "exponential", delay: 3_000 },
    timeoutMs: 45_000,
    buildJobId: defaultAsOfJobId,
  },
  COMMIT_STATEMENT_IMPORT: {
    type: "COMMIT_STATEMENT_IMPORT",
    payloadSchema: commitStatementImportJobPayloadSchema,
    queue: QUEUE_NAME,
    /**
     * One attempt. The commit is resumable by design — rows already written are
     * recognised by fingerprint — so a human retry is safer than an automatic
     * one that races a still-running import.
     */
    attempts: 1,
    backoff: { type: "fixed", delay: 5_000 },
    /** Thousands of rows, each its own transaction. */
    timeoutMs: 600_000,
    buildJobId: defaultAsOfJobId,
  },
  PROCESS_DOCUMENT: {
    type: "PROCESS_DOCUMENT",
    payloadSchema: processDocumentJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    timeoutMs: 30_000,
    buildJobId: defaultAsOfJobId,
  },
  SYNC_INTEGRATION: {
    type: "SYNC_INTEGRATION",
    payloadSchema: syncIntegrationJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    timeoutMs: 30_000,
    buildJobId: defaultAsOfJobId,
  },
  /*
   * Recurring intelligence chain. Every handler is idempotent — stream
   * identity is (household, signature, direction) and expectation identity is
   * (stream, window start) — so a retry updates rather than duplicates.
   */
  DETECT_RECURRING_STREAMS: {
    type: "DETECT_RECURRING_STREAMS",
    payloadSchema: detectRecurringStreamsJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    timeoutMs: 60_000,
    buildJobId: defaultAsOfJobId,
  },
  DETECT_SUBSCRIPTIONS: {
    type: "DETECT_SUBSCRIPTIONS",
    payloadSchema: detectSubscriptionsJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    timeoutMs: 30_000,
    buildJobId: defaultAsOfJobId,
  },
  CALCULATE_RECURRING_PRICE_CHANGES: {
    type: "CALCULATE_RECURRING_PRICE_CHANGES",
    payloadSchema: calculateRecurringPriceChangesJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    timeoutMs: 30_000,
    buildJobId: defaultAsOfJobId,
  },
  GENERATE_EXPECTED_TRANSACTIONS: {
    type: "GENERATE_EXPECTED_TRANSACTIONS",
    payloadSchema: generateExpectedTransactionsJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    timeoutMs: 30_000,
    buildJobId: defaultAsOfJobId,
  },
  MATCH_EXPECTED_TRANSACTIONS: {
    type: "MATCH_EXPECTED_TRANSACTIONS",
    payloadSchema: matchExpectedTransactionsJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    timeoutMs: 30_000,
    buildJobId: defaultAsOfJobId,
  },
  DETECT_MISSING_EXPECTED: {
    type: "DETECT_MISSING_EXPECTED",
    payloadSchema: detectMissingExpectedJobPayloadSchema,
    queue: QUEUE_NAME,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    timeoutMs: 30_000,
    buildJobId: defaultAsOfJobId,
  },
  AI_CLASSIFY_TRANSACTION_CLUSTERS: {
    type: "AI_CLASSIFY_TRANSACTION_CLUSTERS",
    payloadSchema: aiClassifyTransactionClustersJobPayloadSchema,
    queue: QUEUE_NAME,
    // One attempt: the service already survives provider failure per batch,
    // and a blind BullMQ retry of an external-call job would double the cost
    // of a genuinely failing provider without changing the outcome.
    attempts: 1,
    backoff: { type: "fixed", delay: 5_000 },
    timeoutMs: 120_000,
    buildJobId: defaultAsOfJobId,
  },
};

/**
 * BullMQ rejects a custom job id containing a colon, because it namespaces its
 * own keys with one: `queue.add` throws `Custom Id cannot contain :`.
 *
 * `defaultAsOfJobId` joins its parts with colons and eleven of the thirteen job
 * types use it, so every one of those enqueues was failing — including the
 * analysis jobs queued after a ledger mutation. Nothing surfaced it because the
 * callers treat enqueueing as fire-and-forget. Sanitising here rather than in each
 * builder means a new job type cannot reintroduce it.
 */
export function sanitizeJobId(jobId: string): string {
  return jobId.replace(/:/g, "-");
}

export function jobOptionsFor(payload: JobPayload): JobsOptions {
  const def = jobRegistry[payload.type];
  return {
    jobId: sanitizeJobId(def.buildJobId(payload)),
    attempts: def.attempts,
    backoff: def.backoff,
    removeOnComplete: 100,
    removeOnFail: 100,
  };
}

export { QUEUE_NAME };
