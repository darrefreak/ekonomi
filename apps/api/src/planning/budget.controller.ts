import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { BudgetService } from "./budget.service";

@ApiTags("budget")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/budget")
export class BudgetController {
  constructor(@Inject(BudgetService) private readonly budget: BudgetService) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.budget.get(user.userId, householdId);
  }
}
