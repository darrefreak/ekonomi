import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { requestIdMiddleware } from "./common/request-id.middleware";
import { ValidationExceptionFilter } from "./common/validation-exception.filter";
import { logger } from "./common/logger";
import { assertProductionConfiguration } from "./common/production-config";
import { enqueueHealthCheck } from "./jobs/queue";

async function bootstrap() {
  // Before anything is wired up, so a misconfigured production process never
  // reaches the point of serving a request.
  assertProductionConfiguration();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn"],
  });

  /**
   * Request bodies large enough for a real bank statement.
   *
   * Express defaults to 100 kB, which rejected a five-year SEB export — roughly
   * 8 000 rows, about 700 kB once base64-encoded — with a bare
   * `413 request entity too large`. Uploads arrive as base64 in JSON (the same
   * shape as document upload), so the transport limit has to clear the
   * per-feature caps rather than sit under them: the statement importer refuses
   * anything over 12 M base64 characters itself, with a message that says what
   * to do.
   */
  app.useBodyParser("json", { limit: "20mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "20mb" });

  app.use(helmet());
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new ValidationExceptionFilter());
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000"],
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle("Family Financial OS API")
    .setDescription("REST API v1")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  logger.info("api_listening", { port });

  try {
    await enqueueHealthCheck("system");
  } catch (err) {
    logger.warn("health_job_enqueue_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

bootstrap().catch((err) => {
  logger.error("api_boot_failed", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
