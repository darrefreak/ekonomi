import { Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { householdIdQuerySchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { FinancialIntelligenceService } from "./financial-intelligence.service";
import { TransactionClusteringService } from "./transaction-clustering.service";

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
    @Inject(TransactionClusteringService)
    private readonly clustering: TransactionClusteringService,
  ) {}

  /**
   * Group the household's transactions and resolve what the evidence allows.
   *
   * A POST because it writes signatures and clusters, though it creates no
   * economic effect: no financial event, no posting, no balance change.
   */
  @Post("analyse")
  analyse(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.clustering.analyse(user.userId, query.householdId);
  }

  /** What the system actually understands, broken out by how it knows. */
  @Get("coverage")
  async coverage(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.clustering.coverage(query.householdId);
  }

  /** Clusters still needing a person, largest first. */
  @Get("clusters/unresolved")
  unresolved(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.clustering.unresolvedClusters(user.userId, query.householdId);
  }

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
