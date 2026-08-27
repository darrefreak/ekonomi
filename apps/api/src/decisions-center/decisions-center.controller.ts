import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { householdIdQuerySchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { DecisionsCenterService } from "./decisions-center.service";

@ApiTags("decisions-center")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/decisions")
export class DecisionsCenterController {
  constructor(
    @Inject(DecisionsCenterService)
    private readonly center: DecisionsCenterService,
  ) {}

  @Get("actions")
  actions(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.center.get(user.userId, query.householdId);
  }
}
