import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { getPool } from "../db/client";
import Redis from "ioredis";

@ApiTags("health")
@Controller()
export class HealthController {
  @Get("health")
  health() {
    return { status: "ok", service: "ffos-api" };
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
