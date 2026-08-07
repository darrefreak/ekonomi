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
import { updateBudgetLineSchema } from "@ffos/schemas";
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
    @Query("householdId") householdId: string,
  ) {
    return this.budget.get(user.userId, householdId);
  }

  @Patch("lines/:lineId")
  updateLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param("lineId") lineId: string,
    @Body(new ZodValidationPipe(updateBudgetLineSchema)) body: unknown,
  ) {
    return this.budget.updateLine(
      user.userId,
      lineId,
      body as ReturnType<typeof updateBudgetLineSchema.parse>,
    );
  }
}
