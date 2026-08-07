import { Queue, Worker, type JobsOptions } from "bullmq";
import { AuditService } from "../audit/audit.service";
import { logger } from "../common/logger";
import { LedgerTruthService } from "../ledger/ledger-truth.service";

export const HEALTH_CHECK_JOB = "HEALTH_CHECK";
export const RECONCILE_ACCOUNT_BALANCES_JOB = "RECONCILE_ACCOUNT_BALANCES";

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    maxRetriesPerRequest: null as null,
  };
}

export function createJobsQueue() {
  return new Queue("ffos-jobs", { connection: redisConnection() });
}

export async function enqueueHealthCheck(householdId = "system") {
  const queue = createJobsQueue();
  const opts: JobsOptions = {
    jobId: `health-${householdId}-${new Date().toISOString().slice(0, 13)}`,
    removeOnComplete: 100,
    removeOnFail: 100,
  };
  await queue.add(
    HEALTH_CHECK_JOB,
    { householdId, type: HEALTH_CHECK_JOB },
    opts,
  );
  await queue.close();
}

export async function enqueueReconcileAccountBalances(
  householdId: string,
  asOf?: string,
) {
  const day = asOf ?? process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
  const queue = createJobsQueue();
  const opts: JobsOptions = {
    // Idempotent job identity for the household/day window.
    jobId: `reconcile-balances-${householdId}-${day}`,
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
  };
  await queue.add(
    RECONCILE_ACCOUNT_BALANCES_JOB,
    {
      householdId,
      asOf: day,
      type: RECONCILE_ACCOUNT_BALANCES_JOB,
    },
    opts,
  );
  await queue.close();
}

export function startWorker() {
  const worker = new Worker(
    "ffos-jobs",
    async (job) => {
      logger.info("job_start", {
        jobId: job.id,
        name: job.name,
        householdId: job.data?.householdId,
      });
      if (job.name === HEALTH_CHECK_JOB) {
        return { ok: true, at: new Date().toISOString() };
      }
      if (job.name === RECONCILE_ACCOUNT_BALANCES_JOB) {
        const householdId = job.data?.householdId as string | undefined;
        if (!householdId || householdId === "system") {
          throw new Error("RECONCILE_ACCOUNT_BALANCES requires householdId");
        }
        const asOf =
          (job.data?.asOf as string | undefined) ??
          process.env.DEMO_AS_OF_DATE ??
          "2026-08-01";
        const audit = new AuditService();
        const ledger = new LedgerTruthService(audit);
        const result = await ledger.reconcileHousehold(householdId, asOf);
        logger.info("job_reconcile_done", {
          jobId: job.id,
          householdId,
          asOf,
          updated: result.updated,
          mismatches: result.mismatches,
        });
        return result;
      }
      logger.warn("job_unknown", { jobId: job.id, name: job.name });
      throw new Error(`Unknown job type: ${job.name}`);
    },
    { connection: redisConnection() },
  );

  worker.on("completed", (job) => {
    logger.info("job_completed", { jobId: job.id, name: job.name });
  });
  worker.on("failed", (job, err) => {
    logger.error("job_failed", { jobId: job?.id, error: err.message });
  });

  logger.info("worker_started", { queue: "ffos-jobs" });
  return worker;
}
