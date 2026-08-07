import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { AdvisorService } from "./advisor.service";

@ApiTags("advisor")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/advisor")
export class AdvisorController {
  constructor(@Inject(AdvisorService) private readonly advisor: AdvisorService) {}

  @Get("brief")
  brief(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.advisor.brief(user.userId, householdId);
  }

  @Get("outcomes")
  outcomes(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.advisor.outcomes(user.userId, householdId);
  }
}
