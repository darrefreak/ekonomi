import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { CurrencyCode } from "@ffos/domain";
import type {
  ContributeSinkingFundInput,
  CreateSinkingFundInput,
  UpdateSinkingFundInput,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import {
  sinkingFundContributions,
  sinkingFunds,
} from "../db/schema-planning";
import { HouseholdAccessService } from "../households/household-access.service";
import { PlanningMetricsService } from "./planning-metrics.service";
import { resolveHouseholdAsOf } from "../common/as-of";

@Injectable()
export class SinkingFundsService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(PlanningMetricsService)
    private readonly planning: PlanningMetricsService,
  ) {}

  private async goalsPayload(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const asOf = await resolveHouseholdAsOf(householdId);
    return this.planning.getGoals(
      householdId,
      (household.baseCurrency || "SEK") as CurrencyCode,
      asOf,
    );
  }

  async create(userId: string, input: CreateSinkingFundInput) {
    const { household } = await this.access.requireCanWrite(
      userId,
      input.householdId,
    );
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const db = getDb();
    await db.insert(sinkingFunds).values({
      householdId: input.householdId,
      name: input.name,
      targetMinor: BigInt(input.targetMinor),
      currentReservedMinor: BigInt(input.currentReservedMinor ?? "0"),
      monthlyContributionMinor: BigInt(input.monthlyContributionMinor ?? "0"),
      targetDate: input.targetDate ?? null,
      priority: input.priority ?? 3,
      categoryKey: input.categoryKey ?? null,
      currency,
    });
    return this.goalsPayload(userId, input.householdId);
  }

  async update(userId: string, fundId: string, input: UpdateSinkingFundInput) {
    await this.access.requireCanWrite(userId, input.householdId);
    const db = getDb();
    const [existing] = await db
      .select()
      .from(sinkingFunds)
      .where(
        and(
          eq(sinkingFunds.id, fundId),
          eq(sinkingFunds.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException("Sinking fund not found");

    const patch: Partial<typeof sinkingFunds.$inferInsert> = {
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
    if (input.priority !== undefined) patch.priority = input.priority;

    await db
      .update(sinkingFunds)
      .set(patch)
      .where(
        and(
          eq(sinkingFunds.id, fundId),
          eq(sinkingFunds.householdId, input.householdId),
        ),
      );

    return this.goalsPayload(userId, input.householdId);
  }

  async contribute(
    userId: string,
    fundId: string,
    input: ContributeSinkingFundInput,
  ) {
    const { household } = await this.access.requireMembership(
      userId,
      input.householdId,
    );
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const amount = BigInt(input.amountMinor);
    const asOf = await resolveHouseholdAsOf(input.householdId);
    const contributedOn = input.contributedOn ?? asOf;
    const db = getDb();

    const [fund] = await db
      .select()
      .from(sinkingFunds)
      .where(
        and(
          eq(sinkingFunds.id, fundId),
          eq(sinkingFunds.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!fund) throw new NotFoundException("Sinking fund not found");

    await db
      .update(sinkingFunds)
      .set({
        currentReservedMinor: fund.currentReservedMinor + amount,
        updatedAt: new Date(),
      })
      .where(eq(sinkingFunds.id, fundId));

    await db.insert(sinkingFundContributions).values({
      householdId: input.householdId,
      sinkingFundId: fundId,
      amountMinor: amount,
      currency,
      contributedOn,
      note: input.note ?? null,
    });

    return this.goalsPayload(userId, input.householdId);
  }
}
