import "reflect-metadata";
import { startWorker } from "./jobs/queue";
import { logger } from "./common/logger";
import { assertProductionConfiguration } from "./common/production-config";

// The worker touches the same database and object storage as the API, so it is
// held to the same production configuration contract.
try {
  assertProductionConfiguration();
} catch (err) {
  logger.error("worker_boot_refused", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
}

startWorker();
logger.info("ffos_worker_boot");
