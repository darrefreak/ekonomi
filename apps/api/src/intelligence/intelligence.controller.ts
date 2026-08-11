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
  verifyRecurringStreamSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ClassificationReviewService } from "./classification-review.service";
import { FinancialIntelligenceService } from "./financial-intelligence.service";
import { RecurringIntelligenceService } from "./recurring-intelligence.service";
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
    @Inject(RecurringIntelligenceService)
    private readonly recurring: RecurringIntelligenceService,
  ) {}

  /**
   * Group the household's transactions, resolve what the evidence allows, and
   * run the recurring pipeline on the resulting clusters (§37): signatures →
   * clusters → rules → recurring detection/persistence → subscriptions →
   * expected transactions → matching → missing.
   *
   * A POST because it writes signatures, clusters and streams, though it
   * creates no economic effect: no financial event, no posting, no balance change.
   */
  @Post("analyse")
  async analyse(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    const clustering = await this.clustering.analyse(user.userId, query.householdId);
    const recurring = await this.recurring.runPipeline(query.householdId);
    return { ...clustering, recurring };
  }

  /** All recurring streams, grouped, with totals, price insights and review. */
  @Get("recurring")
  recurringOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.recurring.overview(user.userId, query.householdId);
  }

  /** The household's answer: recurring or not, subscription or not (§11). */
  @Post("recurring/:recurringId/verify")
  verifyRecurring(
    @CurrentUser() user: AuthenticatedUser,
    @Param("recurringId", new ParseUUIDPipe()) recurringId: string,
    @Body(new ZodValidationPipe(verifyRecurringStreamSchema)) body: unknown,
  ) {
    const input = verifyRecurringStreamSchema.parse(body);
    return this.recurring.verify(user.userId, {
      householdId: input.householdId,
      recurringId,
      status: input.status,
      isSubscription: input.isSubscription,
    });
  }

  /** Upcoming expected windows and unresolved missing-expected notices. */
  @Get("expected")
  expected(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.recurring.expectedUpcoming(user.userId, query.householdId);
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
