import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { adoptSmartBudgetSchema, smartBudgetQuerySchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SmartBudgetService } from "./smart-budget.service";

@ApiTags("smart-budget")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/smart-budget")
export class SmartBudgetController {
  constructor(
    @Inject(SmartBudgetService) private readonly smartBudget: SmartBudgetService,
  ) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(smartBudgetQuerySchema))
    query: { householdId: string; month?: string },
  ) {
    return this.smartBudget.get(user.userId, query.householdId, query.month);
  }

  @Post()
  adopt(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(adoptSmartBudgetSchema)) body: unknown,
  ) {
    return this.smartBudget.adopt(user.userId, adoptSmartBudgetSchema.parse(body));
  }
}
