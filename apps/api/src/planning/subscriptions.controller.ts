import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { householdIdQuerySchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SubscriptionsService } from "./subscriptions.service";

@ApiTags("subscriptions")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/subscriptions")
export class SubscriptionsController {
  constructor(
    @Inject(SubscriptionsService) private readonly subscriptions: SubscriptionsService,
  ) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.subscriptions.get(user.userId, query.householdId);
  }
}
