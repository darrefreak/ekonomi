import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  householdIdQuerySchema,
  lineIdParamSchema,
  updateBudgetLineSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BudgetService } from "./budget.service";

@ApiTags("budget")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/budget")
export class BudgetController {
  constructor(@Inject(BudgetService) private readonly budget: BudgetService) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.budget.get(user.userId, query.householdId);
  }

  @Patch("lines/:lineId")
  updateLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(lineIdParamSchema))
    params: { lineId: string },
    @Body(new ZodValidationPipe(updateBudgetLineSchema)) body: unknown,
  ) {
    return this.budget.updateLine(
      user.userId,
      params.lineId,
      updateBudgetLineSchema.parse(body),
    );
  }
}
