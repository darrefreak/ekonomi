import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  householdIdQuerySchema,
  reportExploreQuerySchema,
  reportsMonthlyQuerySchema,
  reportsYearlyQuerySchema,
  type ReportExploreQuery,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ReportExploreService } from "./report-explore.service";
import { ReportsService } from "./reports.service";
import { WeeklyReviewService } from "./weekly-review.service";

@ApiTags("reports")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/reports")
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(ReportExploreService)
    private readonly explore: ReportExploreService,
    @Inject(WeeklyReviewService)
    private readonly weekly: WeeklyReviewService,
  ) {}

  @Get("explore")
  exploreReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reportExploreQuerySchema))
    query: ReportExploreQuery,
  ) {
    return this.explore.explore(user.userId, query);
  }

  @Get("weekly")
  weeklyReview(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.weekly.get(user.userId, query.householdId);
  }

  @Get("monthly")
  monthly(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reportsMonthlyQuerySchema))
    query: { householdId: string; period?: string; asOf?: string },
  ) {
    return this.reports.monthly(
      user.userId,
      query.householdId,
      query.period,
      query.asOf,
    );
  }

  @Get("yearly")
  yearly(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reportsYearlyQuerySchema))
    query: { householdId: string; year?: string; asOf?: string },
  ) {
    return this.reports.yearly(
      user.userId,
      query.householdId,
      query.year ? Number(query.year) : undefined,
      query.asOf,
    );
  }
}
