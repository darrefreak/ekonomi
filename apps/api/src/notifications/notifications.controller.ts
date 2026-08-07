import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { householdIdQuerySchema, idParamSchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/notifications")
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.notifications.list(user.userId, query.householdId);
  }

  @Post("read-all")
  markAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.notifications.markAllRead(user.userId, query.householdId);
  }

  @Post(":id/read")
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ) {
    return this.notifications.markRead(
      user.userId,
      query.householdId,
      params.id,
    );
  }
}
