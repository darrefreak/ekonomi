import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { householdIdQuerySchema, updateSettingsSchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SettingsService } from "./settings.service";

@ApiTags("settings")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/settings")
export class SettingsController {
  constructor(
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.settings.get(user.userId, query.householdId);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateSettingsSchema)) body: unknown,
  ) {
    return this.settings.update(
      user.userId,
      updateSettingsSchema.parse(body),
    );
  }
}
