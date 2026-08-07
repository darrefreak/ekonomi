import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CashflowService } from "./cashflow.service";

@ApiTags("cashflow")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/cashflow")
export class CashflowController {
  constructor(@Inject(CashflowService) private readonly cashflow: CashflowService) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.cashflow.get(user.userId, householdId);
  }
}
