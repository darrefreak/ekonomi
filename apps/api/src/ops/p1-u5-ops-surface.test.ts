import assert from "node:assert/strict";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import {
  anomaliesResponseSchema,
  analysisRunsResponseSchema,
  auditLogsResponseSchema,
  subscriptionsResponseSchema,
  updateRecurringStatusSchema,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { householdMembers, households, users } from "../db/schema";
import { anomalyFindings } from "../db/schema-decisions";
import { recurringItems } from "../db/schema-planning";
import { AuditService } from "../audit/audit.service";
import { AnalysisRunsService } from "../decisions/analysis-runs.service";
import { AnomalyService } from "../decisions/anomaly.service";
import type { HouseholdAccessService } from "../households/household-access.service";
import { PlanningMetricsService } from "../planning/planning-metrics.service";
import { SubscriptionsService } from "../planning/subscriptions.service";
import { runJobHandler } from "../jobs/handlers";

test("P1-U5 ops surface: anomalies dismiss, audit list, recurring status, analysis runs", async () => {
  if (!process.env.DATABASE_URL) return;

  const db = getDb();
  const [demoUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, "demo@ffos.local"))
    .limit(1);
  if (!demoUser) return;
  const [membership] = await db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.userId, demoUser.id))
    .limit(1);
  if (!membership) return;
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, membership.householdId))
    .limit(1);
  if (!household) return;

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: membership.id, role: "OWNER" },
    }),
    requireCanWrite: async () => ({
      household,
      member: { id: membership.id, role: "OWNER" },
    }),
    requireAdmin: async () => ({
      household,
      member: { id: membership.id, role: "OWNER" },
    }),
  } as unknown as HouseholdAccessService;

  const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
  const anomaly = new AnomalyService(access);
  await anomaly.run(household.id, asOf);
  const listed = anomaliesResponseSchema.parse(
    await anomaly.listForUser(demoUser.id, household.id),
  );

  if (listed.items.length > 0) {
    const first = listed.items[0]!;
    const afterDismiss = anomaliesResponseSchema.parse(
      await anomaly.dismiss(demoUser.id, household.id, first.id),
    );
    assert.ok(!afterDismiss.items.some((i) => i.id === first.id));

    const [row] = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.id, first.id))
      .limit(1);
    assert.ok(row?.dismissedAt);
  }

  const audit = new AuditService();
  await audit.record({
    householdId: household.id,
    actorUserId: demoUser.id,
    action: "p1_u5.test",
    entity: "ops_surface",
    entityId: household.id,
  });
  const logs = auditLogsResponseSchema.parse(await audit.list(household.id));
  assert.ok(logs.items.some((i) => i.action === "p1_u5.test"));

  const [recurring] = await db
    .select()
    .from(recurringItems)
    .where(eq(recurringItems.householdId, household.id))
    .limit(1);
  if (recurring) {
    const subs = new SubscriptionsService(access, new PlanningMetricsService());
    const updated = subscriptionsResponseSchema.parse(
      await subs.updateRecurringStatus(
        demoUser.id,
        recurring.id,
        updateRecurringStatusSchema.parse({
          householdId: household.id,
          status: "CONFIRMED",
        }),
      ),
    );
    const match = updated.recurring.find((r) => r.id === recurring.id);
    assert.equal(match?.status, "CONFIRMED");

    await db
      .update(recurringItems)
      .set({ status: recurring.status, updatedAt: new Date() })
      .where(
        and(
          eq(recurringItems.id, recurring.id),
          eq(recurringItems.householdId, household.id),
        ),
      );
  }

  await runJobHandler({
    type: "RUN_ANOMALY_ANALYSIS",
    householdId: household.id,
    asOf,
  });
  const runs = analysisRunsResponseSchema.parse(
    await new AnalysisRunsService(access).listForUser(demoUser.id, household.id),
  );
  assert.ok(runs.items.some((r) => r.kind === "RUN_ANOMALY_ANALYSIS" && r.status === "READY"));
});
