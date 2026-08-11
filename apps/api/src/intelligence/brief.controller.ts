import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { householdIdQuerySchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { FinancialBriefService } from "./financial-brief.service";

/**
 * Financial Brief V2 (§33–§45).
 *
 * Read-only: the brief is computed from deterministic findings and cached by
 * input hash. It works identically with AI off — the template pipeline is
 * the product, AI is wording (§37).
 */
@ApiTags("brief")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/brief")
export class BriefController {
  constructor(
    @Inject(FinancialBriefService) private readonly brief: FinancialBriefService,
  ) {}

  @Get()
  getBrief(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.brief.getBrief(user.userId, query.householdId);
  }
}
