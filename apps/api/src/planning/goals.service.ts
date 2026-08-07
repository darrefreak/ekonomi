import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { CurrencyCode } from "@ffos/domain";
import type {
  ContributeGoalInput,
  CreateGoalInput,
  UpdateGoalInput,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import {
  goalContributions,
  goals,
  sinkingFundContributions,
  sinkingFunds,
} from "../db/schema-planning";
import { HouseholdAccessService } from "../households/household-access.service";
import { PlanningMetricsService } from "./planning-metrics.service";

@Injectable()
export class GoalsService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(PlanningMetricsService)
    private readonly planning: PlanningMetricsService,
  ) {}

  async get(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    return this.planning.getGoals(
      householdId,
      (household.baseCurrency || "SEK") as CurrencyCode,
      asOf,
    );
  }

  async create(userId: string, input: CreateGoalInput) {
    const { household } = await this.access.requireCanWrite(
      userId,
      input.householdId,
    );
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const db = getDb();

    if (input.sinkingFundId) {
      const [fund] = await db
        .select()
        .from(sinkingFunds)
        .where(
          and(
            eq(sinkingFunds.id, input.sinkingFundId),
            eq(sinkingFunds.householdId, input.householdId),
          ),
        )
        .limit(1);
      if (!fund) throw new NotFoundException("Sinking fund not found");
    }

    const [row] = await db
      .insert(goals)
      .values({
        householdId: input.householdId,
        name: input.name,
        goalType: input.goalType,
        targetMinor: BigInt(input.targetMinor),
        currentMinor: BigInt(input.currentMinor ?? "0"),
        monthlyContributionMinor: BigInt(input.monthlyContributionMinor ?? "0"),
        targetDate: input.targetDate ?? null,
        priority: input.priority ?? 3,
        sinkingFundId: input.sinkingFundId ?? null,
        currency,
      })
      .returning();

    if (!row) throw new NotFoundException("Failed to create goal");
    return this.get(userId, input.householdId);
  }

  async update(userId: string, goalId: string, input: UpdateGoalInput) {
    await this.access.requireCanWrite(userId, input.householdId);
    const db = getDb();
    const [existing] = await db
      .select()
      .from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.householdId, input.householdId)))
      .limit(1);
    if (!existing) throw new NotFoundException("Goal not found");

    const patch: Partial<typeof goals.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) patch.name = input.name;
    if (input.targetMinor !== undefined) {
      const target = BigInt(input.targetMinor);
      if (target < 0n) throw new BadRequestException("targetMinor must be >= 0");
      patch.targetMinor = target;
    }
    if (input.monthlyContributionMinor !== undefined) {
      const monthly = BigInt(input.monthlyContributionMinor);
      if (monthly < 0n) {
        throw new BadRequestException("monthlyContributionMinor must be >= 0");
      }
      patch.monthlyContributionMinor = monthly;
    }
    if (input.targetDate !== undefined) patch.targetDate = input.targetDate;
    if (input.status !== undefined) patch.status = input.status;
    if (input.priority !== undefined) patch.priority = input.priority;

    await db
      .update(goals)
      .set(patch)
      .where(and(eq(goals.id, goalId), eq(goals.householdId, input.householdId)));

    return this.get(userId, input.householdId);
  }

  async contribute(userId: string, goalId: string, input: ContributeGoalInput) {
    const { household } = await this.access.requireMembership(
      userId,
      input.householdId,
    );
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const amount = BigInt(input.amountMinor);
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const contributedOn = input.contributedOn ?? asOf;
    const db = getDb();

    const [goal] = await db
      .select()
      .from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.householdId, input.householdId)))
      .limit(1);
    if (!goal) throw new NotFoundException("Goal not found");

    const nextCurrent = goal.currentMinor + amount;
    await db
      .update(goals)
      .set({ currentMinor: nextCurrent, updatedAt: new Date() })
      .where(eq(goals.id, goalId));

    await db.insert(goalContributions).values({
      householdId: input.householdId,
      goalId,
      amountMinor: amount,
      currency,
      contributedOn,
      note: input.note ?? null,
    });

    if (goal.sinkingFundId) {
      const [fund] = await db
        .select()
        .from(sinkingFunds)
        .where(
          and(
            eq(sinkingFunds.id, goal.sinkingFundId),
            eq(sinkingFunds.householdId, input.householdId),
          ),
        )
        .limit(1);
      if (fund) {
        await db
          .update(sinkingFunds)
          .set({
            currentReservedMinor: fund.currentReservedMinor + amount,
            updatedAt: new Date(),
          })
          .where(eq(sinkingFunds.id, fund.id));
        await db.insert(sinkingFundContributions).values({
          householdId: input.householdId,
          sinkingFundId: fund.id,
          amountMinor: amount,
          currency,
          contributedOn,
          note: input.note ?? `Bidrag via mål: ${goal.name}`,
        });
      }
    }

    return this.get(userId, input.householdId);
  }
}
