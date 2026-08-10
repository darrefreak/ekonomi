import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  erasureConfirmSchema,
  householdIdQuerySchema,
  privacyDeleteRequestSchema,
  privacyExportRequestSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ErasureService } from "./erasure.service";
import { PrivacyService } from "./privacy.service";

const requestIdParamSchema = z.object({ requestId: z.string().uuid() });

@ApiTags("privacy")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/privacy")
export class PrivacyController {
  constructor(
    @Inject(PrivacyService) private readonly privacy: PrivacyService,
    @Inject(ErasureService) private readonly erasure: ErasureService,
  ) {}

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

  /**
   * Execute a deletion request the participant already made, after they type
   * the household's name back. Retrying a confirmation is safe.
   */
  @Post("requests/:requestId/confirm")
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(requestIdParamSchema))
    params: { requestId: string },
    @Body(new ZodValidationPipe(erasureConfirmSchema)) body: unknown,
  ) {
    return this.erasure.confirm(
      user.userId,
      params.requestId,
      erasureConfirmSchema.parse(body),
    );
  }

  @Post("requests/:requestId/cancel")
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(requestIdParamSchema))
    params: { requestId: string },
  ) {
    return this.erasure.cancel(user.userId, params.requestId);
  }

  /** Households this user owns, so the surface knows what erasing would affect. */
  @Get("erasable")
  erasable(@CurrentUser() user: AuthenticatedUser) {
    return this.erasure.ownedHouseholds(user.userId).then((items) => ({ items }));
  }

  @Delete("me")
  deleteSelf(@CurrentUser() user: AuthenticatedUser) {
    return this.erasure.deleteSelf(user.userId);
  }
}
