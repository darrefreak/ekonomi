import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
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
    @Query("householdId") householdId: string,
    @Query("period") period?: string,
  ) {
    return this.reports.monthly(user.userId, householdId, period);
  }

  @Get("yearly")
  yearly(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
    @Query("year") year?: string,
  ) {
    return this.reports.yearly(
      user.userId,
      householdId,
      year ? Number(year) : undefined,
    );
  }
}
