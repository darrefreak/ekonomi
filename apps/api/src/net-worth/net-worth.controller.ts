import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { NetWorthService } from "./net-worth.service";

@ApiTags("net-worth")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/net-worth")
export class NetWorthController {
  constructor(@Inject(NetWorthService) private readonly netWorth: NetWorthService) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.netWorth.get(user.userId, householdId);
  }
}
