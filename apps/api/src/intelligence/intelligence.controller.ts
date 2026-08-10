import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { householdIdQuerySchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { FinancialIntelligenceService } from "./financial-intelligence.service";

/**
 * Read-only intelligence surfaces.
 *
 * Every figure is computed by `packages/financial-engine` from the household's own
 * data. Nothing here writes, and no endpoint accepts a number to store.
 */
@ApiTags("intelligence")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/intelligence")
export class IntelligenceController {
  constructor(
    @Inject(FinancialIntelligenceService)
    private readonly intelligence: FinancialIntelligenceService,
  ) {}

  @Get("liquidity")
  liquidity(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.intelligence.liquidity(user.userId, query.householdId);
  }

  @Get("baselines")
  baselines(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.intelligence.baselines(user.userId, query.householdId);
  }

  @Get("savings-target")
  savingsTarget(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.intelligence.savingsTarget(user.userId, query.householdId);
  }
}
