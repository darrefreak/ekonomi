import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { WealthService } from "./wealth.service";

@ApiTags("wealth")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1")
export class WealthController {
  constructor(@Inject(WealthService) private readonly wealth: WealthService) {}

  @Get("investments")
  investments(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.wealth.investments(user.userId, householdId);
  }

  @Get("assets")
  assets(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.wealth.assets(user.userId, householdId);
  }
}
