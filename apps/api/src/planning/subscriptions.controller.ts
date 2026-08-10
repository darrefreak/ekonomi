import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  householdIdQuerySchema,
  recurringIdParamSchema,
  updateRecurringStatusSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SubscriptionsService } from "./subscriptions.service";

@ApiTags("subscriptions")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1")
export class SubscriptionsController {
  constructor(
    @Inject(SubscriptionsService) private readonly subscriptions: SubscriptionsService,
  ) {}

  @Get("subscriptions")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.subscriptions.get(user.userId, query.householdId);
  }

  @Patch("recurring/:recurringId")
  updateRecurring(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(recurringIdParamSchema))
    params: { recurringId: string },
    @Body(new ZodValidationPipe(updateRecurringStatusSchema)) body: unknown,
  ) {
    return this.subscriptions.updateRecurringStatus(
      user.userId,
      params.recurringId,
      updateRecurringStatusSchema.parse(body),
    );
  }
}
