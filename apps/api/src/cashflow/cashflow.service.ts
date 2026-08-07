import { Inject, Injectable } from "@nestjs/common";
import type { CurrencyCode } from "@ffos/domain";
import { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";

@Injectable()
export class CashflowService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(HouseholdMetricsService)
    private readonly metrics: HouseholdMetricsService,
  ) {}

  async get(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    return this.metrics.cashflow(
      householdId,
      (household.baseCurrency || "SEK") as CurrencyCode,
      asOf,
    );
  }
}
