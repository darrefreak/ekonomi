import { Queue, Worker, type JobsOptions } from "bullmq";
import { logger } from "../common/logger";

export const HEALTH_CHECK_JOB = "HEALTH_CHECK";

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
      return { ok: true, skipped: true };
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
