import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  reportsMonthlyQuerySchema,
  reportsYearlyQuerySchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { resolveAsOf } from "../common/as-of";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ReportsService } from "./reports.service";

@ApiTags("reports")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/reports")
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

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
      resolveAsOf(query.asOf),
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
      resolveAsOf(query.asOf),
    );
  }
}
