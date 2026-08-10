import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { getPool } from "../db/client";
import Redis from "ioredis";

/**
 * Host, port, database and bucket names only. A connection string carries a
 * password, and this endpoint is unauthenticated.
 */
function serving() {
  let database: string | null = null;
  let host: string | null = null;
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    database = decodeURIComponent(url.pathname.replace(/^\//, "")) || null;
    host = url.hostname || null;
  } catch {
    database = null;
  }
  return {
    environment: process.env.APP_ENV ?? "development",
    database,
    databaseHost: host,
    bucket: process.env.S3_BUCKET ?? null,
  };
}

@ApiTags("health")
@Controller()
export class HealthController {
  /**
   * Also states which environment and database this process is actually
   * serving. Preflight can otherwise verify one database while the running
   * application writes to another — the exact mistake the pilot guards exist
   * to prevent, and one a green check would hide.
   */
  @Get("health")
  health() {
    return { status: "ok", service: "ffos-api", serving: serving() };
  }

  @Get("health/live")
  live() {
    return { status: "live" };
  }

  @Get("health/ready")
  async ready() {
    const checks: Record<string, string> = {};
    try {
      await getPool().query("select 1");
      checks.postgres = "ok";
    } catch {
      checks.postgres = "error";
    }

    try {
      const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
      await redis.connect();
      const pong = await redis.ping();
      checks.redis = pong === "PONG" ? "ok" : "error";
      redis.disconnect();
    } catch {
      checks.redis = "error";
    }

    const ready = Object.values(checks).every((v) => v === "ok");
    return { status: ready ? "ready" : "not_ready", checks };
  }
}
