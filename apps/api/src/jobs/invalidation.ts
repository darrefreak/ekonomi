import { logger } from "../common/logger";
import {
  enqueueCalculateMetrics,
  enqueueGenerateForecast,
  enqueueGenerateOpportunities,
  enqueueRunRiskAnalysis,
} from "./queue";

/**
 * Maps a ledger economic mutation to the set of downstream jobs to enqueue.
 * Fire-and-forget from the caller's perspective — failures are logged, never
 * thrown, so a Redis outage can't block a financial write.
 */
export async function invalidateAfterEconomicMutation(
  householdId: string,
  asOf: string,
): Promise<void> {
  const jobs: Array<[string, () => Promise<unknown>]> = [
    ["CALCULATE_METRICS", () => enqueueCalculateMetrics(householdId, asOf)],
    ["GENERATE_OPPORTUNITIES", () => enqueueGenerateOpportunities(householdId, asOf)],
    ["RUN_RISK_ANALYSIS", () => enqueueRunRiskAnalysis(householdId, asOf)],
    ["GENERATE_FORECAST", () => enqueueGenerateForecast(householdId, asOf)],
  ];

  await Promise.all(
    jobs.map(async ([name, enqueue]) => {
      try {
        await enqueue();
      } catch (err) {
        logger.warn("job_enqueue_failed", {
          jobType: name,
          householdId,
          asOf,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
}
