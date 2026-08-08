import assert from "node:assert/strict";
import { requireTestDatabase } from "../testing/require-test-database";
import { assertFixture } from "../testing/demo-fixture";
import { test } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  advisorBriefResponseSchema,
  advisorChatRequestSchema,
  advisorChatResponseSchema,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { householdMembers, households, users } from "../db/schema";
import type { DecisionsService } from "../decisions/decisions.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import type { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { PlanningMetricsService } from "../planning/planning-metrics.service";
import type { VehiclesService } from "../vehicles/vehicles.service";
import type { VehicleIntelService } from "../vehicle-intel/vehicle-intel.service";
import { AdvisorService } from "./advisor.service";
import { listAdvisorTools } from "./ai-tool-registry";

test("advisorChatRequestSchema rejects empty message", () => {
  assert.throws(() =>
    advisorChatRequestSchema.parse({
      householdId: "11111111-1111-4111-8111-111111111111",
      message: "",
    }),
  );
});

test("advisor tool registry is read-only allowlist", () => {
  const tools = listAdvisorTools();
  assert.ok(tools.length >= 10);
  assert.ok(tools.every((t) => t.readOnly === true));
});

test("AI flag gate and tools-only chat/brief", async () => {
  requireTestDatabase();

  const db = getDb();
  const [demoUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, "demo@ffos.local"))
    .limit(1);
  assertFixture(demoUser, "demoUser");
  const [membership] = await db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.userId, demoUser.id))
    .limit(1);
  assertFixture(membership, "membership");
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, membership.householdId))
    .limit(1);
  assertFixture(household, "household");

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: membership.id, role: "OWNER" },
    }),
  } as unknown as HouseholdAccessService;

  const flags = new FeatureFlagsService();
  const planning = new PlanningMetricsService();
  const metrics = new HouseholdMetricsService();

  const decisions = {
    opportunities: async () => ({
      items: [
        {
          id: "opp-1",
          title: "Test opportunity",
          description: "d",
          estimatedAnnualSaving: {
            amountMinor: "120000",
            currency: "SEK",
          },
          confidence: 0.8,
          effort: "low",
          risk: "low",
          priority: 1,
          status: "NEW",
          category: "test",
          evidence: [{ kind: "page", id: "1", label: "Debt", href: "/debt" }],
        },
      ],
      lifestyleCreep: { creeping: false },
    }),
    risk: async () => ({
      signals: [
        {
          title: "Liquidity watch",
          level: "MODERATE",
          score: 40,
          evidence: [],
        },
      ],
    }),
  } as unknown as DecisionsService;

  const vehicles = {
    list: async () => ({ items: [] }),
  } as unknown as VehiclesService;

  const vehicleIntel = {
    market: async () => ({ candidates: [], comparisons: [] }),
  } as unknown as VehicleIntelService;

  const service = new AdvisorService(
    access,
    planning,
    decisions,
    vehicles,
    vehicleIntel,
    metrics,
    flags,
  );

  const prev = process.env.FFOS_FEATURE_AI;
  process.env.FFOS_FEATURE_AI = "false";
  await assert.rejects(
    () => service.brief("user-1", household.id),
    (err: unknown) => err instanceof ForbiddenException,
  );
  process.env.FFOS_FEATURE_AI = "true";

  const brief = advisorBriefResponseSchema.parse(
    await service.brief("user-1", household.id),
  );
  assert.ok(brief.sections.length > 0);
  assert.ok(brief.toolTrace.some((t) => t.tool === "get_budget" && t.ok));
  assert.ok(
    brief.sections.every((s) => !s.detail.includes("minor units")),
  );
  assert.ok(
    brief.sections.some((s) => (s.citations ?? []).some((c) => c.href)),
  );

  const chat = advisorChatResponseSchema.parse(
    await service.chat("user-1", {
      householdId: household.id,
      message: "Hur ser vår budget ut?",
    }),
  );
  assert.ok(chat.usedTools.includes("get_budget"));
  assert.ok(chat.citations.length > 0);
  assert.match(chat.reply, /Budget|budget|verktyg/i);

  if (prev === undefined) delete process.env.FFOS_FEATURE_AI;
  else process.env.FFOS_FEATURE_AI = prev;
});
