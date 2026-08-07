import "reflect-metadata";
import { startWorker } from "./jobs/queue";
import { logger } from "./common/logger";

startWorker();
logger.info("ffos_worker_boot");
