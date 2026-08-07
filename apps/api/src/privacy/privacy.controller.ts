import { Body, Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  householdIdQuerySchema,
  privacyDeleteRequestSchema,
  privacyExportRequestSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrivacyService } from "./privacy.service";

@ApiTags("privacy")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/privacy")
export class PrivacyController {
  constructor(@Inject(PrivacyService) private readonly privacy: PrivacyService) {}

  @Post("export")
  export(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(privacyExportRequestSchema)) body: unknown,
  ) {
    const parsed = privacyExportRequestSchema.parse(body);
    return this.privacy.export(user.userId, parsed.householdId);
  }

  @Post("delete-request")
  deleteRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(privacyDeleteRequestSchema)) body: unknown,
  ) {
    const parsed = privacyDeleteRequestSchema.parse(body);
    return this.privacy.requestDelete(user.userId, parsed);
  }

  @Get("requests")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.privacy.listRequests(user.userId, query.householdId);
  }
}
