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
    @Query("householdId") householdId: string,
  ) {
    return this.goals.get(user.userId, householdId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createGoalSchema)) body: unknown,
  ) {
    return this.goals.create(
      user.userId,
      body as ReturnType<typeof createGoalSchema.parse>,
    );
  }

  @Patch(":goalId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("goalId") goalId: string,
    @Body(new ZodValidationPipe(updateGoalSchema)) body: unknown,
  ) {
    return this.goals.update(
      user.userId,
      goalId,
      body as ReturnType<typeof updateGoalSchema.parse>,
    );
  }

  @Post(":goalId/contributions")
  contribute(
    @CurrentUser() user: AuthenticatedUser,
    @Param("goalId") goalId: string,
    @Body(new ZodValidationPipe(contributeGoalSchema)) body: unknown,
  ) {
    return this.goals.contribute(
      user.userId,
      goalId,
      body as ReturnType<typeof contributeGoalSchema.parse>,
    );
  }
}
