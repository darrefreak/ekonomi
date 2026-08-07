import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { FinancialCoverageService } from "./financial-coverage.service";

@ApiTags("coverage")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/coverage")
export class FinancialCoverageController {
  constructor(
    @Inject(FinancialCoverageService)
    private readonly coverage: FinancialCoverageService,
  ) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.coverage.get(user.userId, householdId);
  }
}
