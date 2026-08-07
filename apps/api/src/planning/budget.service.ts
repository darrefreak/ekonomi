import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CurrencyCode } from "@ffos/domain";
import { HouseholdAccessService } from "../households/household-access.service";
import { PlanningMetricsService } from "./planning-metrics.service";

@Injectable()
export class BudgetService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(PlanningMetricsService)
    private readonly planning: PlanningMetricsService,
  ) {}

  async get(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const budget = await this.planning.getBudget(
      householdId,
      (household.baseCurrency || "SEK") as CurrencyCode,
      asOf,
    );
    if (!budget) throw new NotFoundException("Budget period not found");
    return budget;
  }
}
