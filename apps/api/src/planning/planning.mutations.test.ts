import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  contributeGoalSchema,
  createGoalSchema,
  updateBudgetLineSchema,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { budgetPeriods, goals, sinkingFunds } from "../db/schema-planning";
import type { HouseholdAccessService } from "../households/household-access.service";
import { BudgetService } from "./budget.service";
import { GoalsService } from "./goals.service";
import { PlanningMetricsService } from "./planning-metrics.service";
import { SinkingFundsService } from "./sinking-funds.service";

test("updateBudgetLineSchema requires household and plannedMinor", () => {
  const parsed = updateBudgetLineSchema.parse({
    householdId: "11111111-1111-4111-8111-111111111111",
    plannedMinor: "850000",
  });
  assert.equal(parsed.plannedMinor, "850000");
});

test("contributeGoalSchema rejects zero amount", () => {
  assert.throws(() =>
    contributeGoalSchema.parse({
      householdId: "11111111-1111-4111-8111-111111111111",
      amountMinor: "0",
    }),
  );
});

test("createGoalSchema defaults type and current", () => {
  const parsed = createGoalSchema.parse({
    householdId: "11111111-1111-4111-8111-111111111111",
    name: "Buffert",
    targetMinor: "10000000",
  });
  assert.equal(parsed.goalType, "CUSTOM");
  assert.equal(parsed.currentMinor, "0");
});

test("budget line update and goal/fund contributions against DB", async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const [periodRow] = await db.select().from(budgetPeriods).limit(1);
  if (!periodRow) return;
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, periodRow.householdId))
    .limit(1);
  if (!household) return;

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
    requireCanWrite: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
    requireAdmin: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
    accountVisibility: async () => "full" as const,
    projectAccountListItem: <T>(item: T) => item,
    projectTransactionItem: <T>(item: T) => item,
  } as unknown as HouseholdAccessService;

  const planning = new PlanningMetricsService();
  const budgetService = new BudgetService(access, planning);
  const goalsService = new GoalsService(access, planning);
  const fundsService = new SinkingFundsService(access, planning);

  const budget = await budgetService.get("user-1", household.id);
  assert.ok(budget.lines.length > 0);
  const line = budget.lines[0]!;
  const original = BigInt(line.planned.amountMinor);
  const nextPlanned = original + 100_00n;

  const updatedBudget = await budgetService.updateLine("user-1", line.id, {
    householdId: household.id,
    plannedMinor: nextPlanned.toString(),
  });
  const updatedLine = updatedBudget.lines.find((l) => l.id === line.id);
  assert.equal(updatedLine?.planned.amountMinor, nextPlanned.toString());

  // restore
  await budgetService.updateLine("user-1", line.id, {
    householdId: household.id,
    plannedMinor: original.toString(),
  });

  const goalRows = await db
    .select()
    .from(goals)
    .where(eq(goals.householdId, household.id));
  const goal = goalRows.find((g) => !g.sinkingFundId) ?? goalRows[0];
  assert.ok(goal);
  const before = goal.currentMinor;
  let linkedFundBefore: bigint | null = null;
  if (goal.sinkingFundId) {
    const [linked] = await db
      .select()
      .from(sinkingFunds)
      .where(eq(sinkingFunds.id, goal.sinkingFundId))
      .limit(1);
    linkedFundBefore = linked?.currentReservedMinor ?? null;
  }

  const afterGoals = await goalsService.contribute("user-1", goal.id, {
    householdId: household.id,
    amountMinor: "25000",
    note: "workstream-d-test",
  });
  const afterGoal = afterGoals.goals.find((g) => g.id === goal.id);
  assert.equal(BigInt(afterGoal!.current.amountMinor), before + 250_00n);

  const [fund] = await db
    .select()
    .from(sinkingFunds)
    .where(eq(sinkingFunds.householdId, household.id))
    .limit(1);
  assert.ok(fund);
  const fundBefore = fund.currentReservedMinor;
  const afterFunds = await fundsService.contribute("user-1", fund.id, {
    householdId: household.id,
    amountMinor: "10000",
  });
  const afterFund = afterFunds.sinkingFunds.find((f) => f.id === fund.id);
  assert.equal(
    BigInt(afterFund!.currentReserved.amountMinor),
    fundBefore + 100_00n,
  );

  // restore amounts for idempotent re-runs
  await db
    .update(goals)
    .set({ currentMinor: before })
    .where(eq(goals.id, goal.id));
  await db
    .update(sinkingFunds)
    .set({ currentReservedMinor: fundBefore })
    .where(eq(sinkingFunds.id, fund.id));
  if (goal.sinkingFundId && linkedFundBefore != null) {
    await db
      .update(sinkingFunds)
      .set({ currentReservedMinor: linkedFundBefore })
      .where(eq(sinkingFunds.id, goal.sinkingFundId));
  }
});
