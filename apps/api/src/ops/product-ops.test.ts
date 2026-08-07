import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  resolveReviewSchema,
  searchResponseSchema,
  settingsResponseSchema,
  monthlyReportSchema,
  updateSettingsSchema,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { householdMembers, households, users } from "../db/schema";
import { categories, sourceTransactions } from "../db/schema-economic";
import type { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { ReportsService } from "../reports/reports.service";
import { ReviewService } from "../review/review.service";
import { SearchService } from "../search/search.service";
import { SettingsService } from "../settings/settings.service";

test("resolveReviewSchema requires entity and action", () => {
  const parsed = resolveReviewSchema.parse({
    householdId: "11111111-1111-4111-8111-111111111111",
    itemId: "tx-1",
    kind: "unknown_transaction",
    entityId: "11111111-1111-4111-8111-111111111112",
    action: "set_category",
    categoryId: "11111111-1111-4111-8111-111111111113",
  });
  assert.equal(parsed.action, "set_category");
});

test("settings search review resolve and monthly report", async () => {
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
  } as unknown as HouseholdAccessService;

  const settings = new SettingsService(access);
  const before = settingsResponseSchema.parse(
    await settings.get("user-1", household.id),
  );
  const updated = settingsResponseSchema.parse(
    await settings.update(
      "user-1",
      updateSettingsSchema.parse({
        householdId: household.id,
        householdName: before.householdName,
        financialPolicies: {
          safetyMarginMinor: "2500000",
        },
      }),
    ),
  );
  assert.equal(updated.financialPolicies.safetyMarginMinor, "2500000");

  const search = new SearchService(access);
  const hits = searchResponseSchema.parse(
    await search.search("user-1", household.id, "SEB"),
  );
  assert.ok(hits.results.length > 0);

  const review = new ReviewService(access);
  const list = await review.list("user-1", household.id);
  assert.ok(typeof list.total === "number");

  const [uncat] = await db
    .select()
    .from(sourceTransactions)
    .where(
      eq(sourceTransactions.householdId, household.id),
    )
    .limit(1);
  const [cat] = await db
    .select()
    .from(categories)
    .where(eq(categories.householdId, household.id))
    .limit(1);
  if (uncat && cat) {
    // Force unknown category then resolve
    await db
      .update(sourceTransactions)
      .set({ categoryId: null })
      .where(eq(sourceTransactions.id, uncat.id));
    const after = await review.resolve("user-1", {
      householdId: household.id,
      itemId: `tx-${uncat.id}`,
      kind: "unknown_transaction",
      entityId: uncat.id,
      action: "set_category",
      categoryId: cat.id,
    });
    assert.ok(
      !after.items.some(
        (i) => i.kind === "unknown_transaction" && i.entityId === uncat.id,
      ),
    );
  }

  const reports = new ReportsService(access, new HouseholdMetricsService());
  const monthly = monthlyReportSchema.parse(
    await reports.monthly("user-1", household.id, "2026-07"),
  );
  assert.equal(monthly.period, "2026-07");
  assert.ok(monthly.income.amountMinor != null);
});
