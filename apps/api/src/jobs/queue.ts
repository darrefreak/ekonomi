import { Queue, Worker } from "bullmq";
import { jobPayloadSchema, type JobPayload, type JobType } from "@ffos/schemas";
import { logger } from "../common/logger";
import { runJobHandler } from "./handlers";
import { jobOptionsFor, jobRegistry, QUEUE_NAME } from "./registry";
import { resolveHouseholdAsOf } from "../common/as-of";
import { queueOptions } from "./redis-connection";

export const HEALTH_CHECK_JOB: JobType = "HEALTH_CHECK";
export const RECONCILE_ACCOUNT_BALANCES_JOB: JobType = "RECONCILE_ACCOUNT_BALANCES";

export function createJobsQueue(): Queue {
  return new Queue(QUEUE_NAME, queueOptions());
}

/**
 * Enqueue any registry-known job. Validates the payload against its schema
 * and derives BullMQ options (jobId/attempts/backoff) from the registry —
 * the single source of truth for job configuration. Opens and closes its
 * own short-lived connection so callers (including fire-and-forget
 * post-commit hooks) never leak Redis connections.
 */
export async function enqueueJob(rawPayload: JobPayload): Promise<string> {
  const def = jobRegistry[rawPayload.type];
  const payload = def.payloadSchema.parse(rawPayload);
  const queue = createJobsQueue();
  try {
    const opts = jobOptionsFor(payload);
    const job = await queue.add(payload.type, payload, opts);
    return job.id ?? opts.jobId ?? payload.type;
  } finally {
    await queue.close();
  }
}

export async function enqueueHealthCheck(householdId: string = "system") {
  return enqueueJob({ type: "HEALTH_CHECK", householdId });
}

export async function enqueueReconcileAccountBalances(householdId: string, asOf?: string) {
  const day = await resolveHouseholdAsOf(householdId, asOf);
  return enqueueJob({ type: "RECONCILE_ACCOUNT_BALANCES", householdId, asOf: day });
}

export async function enqueueCalculateMetrics(householdId: string, asOf?: string) {
  return enqueueJob({ type: "CALCULATE_METRICS", householdId, asOf });
}

export async function enqueueCalculateNetWorth(householdId: string, asOf?: string) {
  return enqueueJob({ type: "CALCULATE_NET_WORTH", householdId, asOf });
}

export async function enqueueGenerateForecast(householdId: string, asOf?: string) {
  return enqueueJob({ type: "GENERATE_FORECAST", householdId, asOf });
}

export async function enqueueGenerateOpportunities(householdId: string, asOf?: string) {
  return enqueueJob({ type: "GENERATE_OPPORTUNITIES", householdId, asOf });
}

export async function enqueueRunRiskAnalysis(householdId: string, asOf?: string) {
  return enqueueJob({ type: "RUN_RISK_ANALYSIS", householdId, asOf });
}

export async function enqueueRunAnomalyAnalysis(householdId: string, asOf?: string) {
  return enqueueJob({ type: "RUN_ANOMALY_ANALYSIS", householdId, asOf });
}

export async function enqueueGenerateInsights(householdId: string, asOf?: string) {
  return enqueueJob({ type: "GENERATE_INSIGHTS", householdId, asOf });
}

export async function enqueueGenerateAiBrief(householdId: string, asOf?: string) {
  return enqueueJob({ type: "GENERATE_AI_BRIEF", householdId, asOf });
}

export async function enqueueProcessDocument(
  householdId: string,
  entityId: string,
  asOf?: string,
) {
  return enqueueJob({ type: "PROCESS_DOCUMENT", householdId, entityId, asOf });
}

export async function enqueueSyncIntegration(
  householdId: string,
  entityId?: string,
  asOf?: string,
) {
  return enqueueJob({ type: "SYNC_INTEGRATION", householdId, entityId, asOf });
}

/**
 * The recurring-intelligence chain, in pipeline order (§37): detect/persist →
 * subscriptions → price changes → expected → match → missing. Enqueued in
 * sequence on the single shared FIFO queue, so the worker runs them in order.
 */
export async function enqueueRecurringIntelligenceChain(
  householdId: string,
  asOf?: string,
): Promise<string[]> {
  const types: JobType[] = [
    "DETECT_RECURRING_STREAMS",
    "DETECT_SUBSCRIPTIONS",
    "CALCULATE_RECURRING_PRICE_CHANGES",
    "GENERATE_EXPECTED_TRANSACTIONS",
    "MATCH_EXPECTED_TRANSACTIONS",
    "DETECT_MISSING_EXPECTED",
  ];
  const ids: string[] = [];
  for (const type of types) {
    ids.push(await enqueueJob({ type, householdId, asOf } as JobPayload));
  }
  return ids;
}

export function startWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      logger.info("job_start", {
        jobId: job.id,
        name: job.name,
        householdId: job.data?.householdId,
      });

      const parsed = jobPayloadSchema.safeParse({
        ...job.data,
        type: job.data?.type ?? job.name,
      });
      if (!parsed.success) {
        logger.error("job_payload_invalid", {
          jobId: job.id,
          issues: parsed.error.issues,
        });
        throw new Error("Invalid job payload");
      }

      const def = jobRegistry[parsed.data.type];
      if (def?.timeoutMs) {
        const started = Date.now();
        const result = await runJobHandler(parsed.data);
        const elapsedMs = Date.now() - started;
        if (elapsedMs > def.timeoutMs) {
          logger.warn("job_over_soft_budget", {
            jobId: job.id,
            type: parsed.data.type,
            elapsedMs,
            timeoutMs: def.timeoutMs,
          });
        }
        return result;
      }
      return runJobHandler(parsed.data);
    },
    queueOptions(),
  );

  worker.on("completed", (job) => {
    logger.info("job_completed", { jobId: job.id, name: job.name });
  });
  worker.on("failed", (job, err) => {
    logger.error("job_failed", { jobId: job?.id, error: err.message });
  });

  logger.info("worker_started", { queue: QUEUE_NAME });
  return worker;
}
