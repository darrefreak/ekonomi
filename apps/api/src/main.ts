import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
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

  const app = await NestFactory.create(AppModule, { logger: ["error", "warn"] });
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
