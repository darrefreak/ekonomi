import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { householdIdQuerySchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { FamilySummaryService } from "./family-summary.service";

/**
 * The family summary the home screen is built on. Read-only: it composes the
 * deterministic engines and works identically with AI off — AI only changes
 * the wording of the narrative.
 */
@ApiTags("family-summary")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/family-summary")
export class FamilySummaryController {
  constructor(
    @Inject(FamilySummaryService) private readonly summary: FamilySummaryService,
  ) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.summary.get(user.userId, query.householdId);
  }
}
