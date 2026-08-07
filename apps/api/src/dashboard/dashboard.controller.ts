import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { householdIdQuerySchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/dashboard")
export class DashboardController {
  constructor(
    @Inject(DashboardService) private readonly dashboard: DashboardService,
  ) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.dashboard.getDashboard(user.userId, query.householdId);
  }
}
