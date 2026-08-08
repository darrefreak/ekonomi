import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { CurrencyCode } from "@ffos/domain";
import {
  householdIdQuerySchema,
  metricSnapshotsQuerySchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { HouseholdAccessService } from "../households/household-access.service";
import { MetricRegistryService } from "./metric-registry.service";

@ApiTags("metrics")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/metrics")
export class MetricsController {
  constructor(
    @Inject(MetricRegistryService)
    private readonly registry: MetricRegistryService,
    @Inject(HouseholdAccessService)
    private readonly access: HouseholdAccessService,
  ) {}

  @Get("definitions")
  definitions() {
    return this.registry.listDefinitions();
  }

  @Get("snapshots")
  async snapshots(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(metricSnapshotsQuerySchema))
    query: { householdId: string; asOf?: string },
  ) {
    const { household } = await this.access.requireMembership(
      user.userId,
      query.householdId,
    );
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf =
      query.asOf ?? process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const result = await this.registry.getSnapshots(
      query.householdId,
      currency,
      asOf,
    );
    const { financialSnapshot: _live, ...response } = result;
    return response;
  }

  /** Lightweight bundle metadata for clients that already have householdId. */
  @Get("meta")
  async meta(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    const { household } = await this.access.requireMembership(
      user.userId,
      query.householdId,
    );
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const result = await this.registry.getSnapshots(
      query.householdId,
      currency,
      asOf,
    );
    return {
      householdId: query.householdId,
      asOf,
      bundleVersion: result.bundleVersion,
      inputHash: result.inputHash,
      calculatedAt: result.calculatedAt,
      coveragePercent: result.coveragePercent,
      freshnessLabel: result.freshnessLabel,
    };
  }
}
