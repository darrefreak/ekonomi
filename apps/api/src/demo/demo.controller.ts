import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ForbiddenException } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { seedDemoHousehold } from "../db/seed/demo-household";

@ApiTags("demo")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/demo")
export class DemoController {
  @Get("info")
  info() {
    return {
      email: "demo@ffos.local",
      passwordHint: "demo-password-123",
      asOf: process.env.DEMO_AS_OF_DATE ?? "2026-08-01",
      reseedAllowed:
        process.env.FFOS_ALLOW_DEMO_RESEED === "true" ||
        process.env.NODE_ENV !== "production",
    };
  }

  @Post("load")
  async load() {
    const allowed =
      process.env.FFOS_ALLOW_DEMO_RESEED === "true" ||
      process.env.NODE_ENV !== "production";
    if (!allowed) {
      throw new ForbiddenException("Demo reseed disabled in this environment");
    }
    const demo = await seedDemoHousehold();
    return {
      ok: true,
      householdId: demo.householdId,
      email: demo.email,
      asOf: demo.asOf,
      message: "Demodata omladdad. Logga in med demo-kontot.",
    };
  }
}
