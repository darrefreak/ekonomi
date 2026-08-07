import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { DebtService } from "./debt.service";

@ApiTags("debt")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/debt")
export class DebtController {
  constructor(@Inject(DebtService) private readonly debt: DebtService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.debt.list(user.userId, householdId);
  }

  @Get(":accountId")
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param("accountId") accountId: string,
    @Query("householdId") householdId: string,
  ) {
    return this.debt.detail(user.userId, householdId, accountId);
  }
}
