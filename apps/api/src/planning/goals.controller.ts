import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  contributeGoalSchema,
  createGoalSchema,
  goalIdParamSchema,
  householdIdQuerySchema,
  updateGoalSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { GoalsService } from "./goals.service";

@ApiTags("goals")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/goals")
export class GoalsController {
  constructor(@Inject(GoalsService) private readonly goals: GoalsService) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.goals.get(user.userId, query.householdId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createGoalSchema)) body: unknown,
  ) {
    return this.goals.create(user.userId, createGoalSchema.parse(body));
  }

  @Patch(":goalId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(goalIdParamSchema))
    params: { goalId: string },
    @Body(new ZodValidationPipe(updateGoalSchema)) body: unknown,
  ) {
    return this.goals.update(
      user.userId,
      params.goalId,
      updateGoalSchema.parse(body),
    );
  }

  @Post(":goalId/contributions")
  contribute(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(goalIdParamSchema))
    params: { goalId: string },
    @Body(new ZodValidationPipe(contributeGoalSchema)) body: unknown,
  ) {
    return this.goals.contribute(
      user.userId,
      params.goalId,
      contributeGoalSchema.parse(body),
    );
  }
}
