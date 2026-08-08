import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { CurrencyCode } from "@ffos/domain";
import type { UpdateRecurringStatusInput } from "@ffos/schemas";
import { HouseholdAccessService } from "../households/household-access.service";
import { getDb } from "../db/client";
import { recurringItems } from "../db/schema-planning";
import { PlanningMetricsService } from "./planning-metrics.service";

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(PlanningMetricsService)
    private readonly planning: PlanningMetricsService,
  ) {}

  async get(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    return this.planning.getSubscriptions(
      householdId,
      (household.baseCurrency || "SEK") as CurrencyCode,
      asOf,
    );
  }

  async updateRecurringStatus(
    userId: string,
    recurringId: string,
    input: UpdateRecurringStatusInput,
  ) {
    await this.access.requireCanWrite(userId, input.householdId);
    const db = getDb();
    const [existing] = await db
      .select()
      .from(recurringItems)
      .where(
        and(
          eq(recurringItems.id, recurringId),
          eq(recurringItems.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException("Recurring item not found");

    await db
      .update(recurringItems)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(recurringItems.id, recurringId));

    return this.get(userId, input.householdId);
  }
}
