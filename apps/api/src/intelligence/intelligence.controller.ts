import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  householdIdQuerySchema,
  resolveClusterSchema,
  updateClassificationRuleSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ClassificationReviewService } from "./classification-review.service";
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
    @Inject(ClassificationReviewService)
    private readonly review: ClassificationReviewService,
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

  /** The open questions: one review item per unresolved cluster, not per row. */
  @Get("review")
  clusterReview(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.review.list(user.userId, query.householdId);
  }

  /** Answer one cluster: accept the candidate, correct it, or skip. */
  @Post("clusters/resolve")
  resolveCluster(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(resolveClusterSchema)) body: unknown,
  ) {
    return this.review.resolve(user.userId, resolveClusterSchema.parse(body));
  }

  /** The rules this household has taught the system. */
  @Get("rules")
  rules(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.review.listRules(user.userId, query.householdId);
  }

  @Patch("rules/:ruleId")
  updateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param("ruleId", new ParseUUIDPipe()) ruleId: string,
    @Body(new ZodValidationPipe(updateClassificationRuleSchema)) body: unknown,
  ) {
    const input = updateClassificationRuleSchema.parse(body);
    return this.review.setRuleEnabled(
      user.userId,
      input.householdId,
      ruleId,
      input.enabled,
    );
  }

  @Delete("rules/:ruleId")
  deleteRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param("ruleId", new ParseUUIDPipe()) ruleId: string,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.review.deleteRule(user.userId, query.householdId, ruleId);
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
