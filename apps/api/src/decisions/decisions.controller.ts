import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { DecisionsService } from "./decisions.service";

@ApiTags("decisions")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1")
export class DecisionsController {
  constructor(@Inject(DecisionsService) private readonly decisions: DecisionsService) {}

  @Get("forecast")
  forecast(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.decisions.forecast(user.userId, householdId);
  }

  @Get("opportunities")
  opportunities(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.decisions.opportunities(user.userId, householdId);
  }

  @Get("risk")
  risk(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.decisions.risk(user.userId, householdId);
  }

  @Get("scenarios")
  scenarios(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.decisions.scenarios(user.userId, householdId);
  }

  @Get("insights")
  insights(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.decisions.insights(user.userId, householdId);
  }
}
