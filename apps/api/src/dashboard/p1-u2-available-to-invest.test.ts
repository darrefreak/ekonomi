import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import { getDb } from "../db/client";
import { households, householdMembers, users } from "../db/schema";
import { accounts } from "../db/schema-economic";
import { householdSettings } from "../db/schema-ops";
import { DebtService } from "../debt/debt.service";
import { DecisionsService } from "../decisions/decisions.service";
import type { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { PlanningMetricsService } from "../planning/planning-metrics.service";
import { ReviewService } from "../review/review.service";
import { stubMerchantsService } from "../merchants/merchants.service.stub";
import { SettingsService } from "../settings/settings.service";
import { VehiclesService } from "../vehicles/vehicles.service";
import { DashboardService } from "./dashboard.service";

test("P1-U2: dashboard exposes availableToInvest with assumptions", async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name: `P1-U2 ATI ${Date.now()}`, baseCurrency: "SEK" })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `p1u2-ati-${Date.now()}@example.test`,
      passwordHash: "x",
      displayName: "ATI User",
    })
    .returning();
  await db.insert(householdMembers).values({
    householdId: household.id,
    userId: user.id,
    role: "OWNER",
  });
  await db.insert(householdSettings).values({
    householdId: household.id,
    minimumCashBalanceMinor: 6_000_00n,
    emergencyFundTargetMinor: 12_000_00n,
    safetyMarginMinor: 2_000_00n,
  });
  await db.insert(accounts).values({
    householdId: household.id,
    name: "ATI Cash",
    accountType: "CHECKING",
    openingBalanceMinor: 100_000_00n,
    currentBalanceMinor: 100_000_00n,
    isShared: true,
  });

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: "m", role: "OWNER" },
    }),
  } as unknown as HouseholdAccessService;

  const metrics = new HouseholdMetricsService();
  const audit = new AuditService();
  const settings = new SettingsService(access, audit);
  const planning = new PlanningMetricsService();
  const review = new ReviewService(access, stubMerchantsService());
  const debt = new DebtService(access, metrics);
  const vehicles = new VehiclesService(access);
  const decisions = new DecisionsService(
    access,
    metrics,
    planning,
    debt,
    vehicles,
  );
  const dashboard = new DashboardService(
    access,
    metrics,
    review,
    planning,
    decisions,
    settings,
  );

  const res = await dashboard.getDashboard(user.id, household.id, "2026-08-01");
  assert.ok(res.availableToInvest);
  assert.ok(res.availableToInvest!.assumptions.length >= 2);
  assert.match(res.availableToInvest!.disclaimer, /inte investeringsrådgivning/i);
  // 100k − 6 − 12 − 2 − 0 sinking − upcoming ≥ 0
  assert.ok(BigInt(res.availableToInvest!.amount.amountMinor) >= 0n);
  assert.equal(
    await db
      .select()
      .from(households)
      .where(eq(households.id, household.id))
      .then((r) => r.length),
    1,
  );
});
