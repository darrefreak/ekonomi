import { Inject, Injectable } from "@nestjs/common";
import type { CurrencyCode } from "@ffos/domain";
import { HouseholdAccessService } from "../households/household-access.service";
import { PlanningMetricsService } from "./planning-metrics.service";
import { resolveHouseholdAsOf } from "../common/as-of";

@Injectable()
export class ContractsService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(PlanningMetricsService)
    private readonly planning: PlanningMetricsService,
  ) {}

  async get(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const asOf = await resolveHouseholdAsOf(householdId);
    return this.planning.getContracts(
      householdId,
      (household.baseCurrency || "SEK") as CurrencyCode,
      asOf,
    );
  }
}
