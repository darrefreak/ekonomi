import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  accountIdParamSchema,
  debtPayoffQuerySchema,
  householdAsOfQuerySchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { DebtService } from "./debt.service";

@ApiTags("debt")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/debt")
export class DebtController {
  constructor(@Inject(DebtService) private readonly debt: DebtService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdAsOfQuerySchema))
    query: { householdId: string; asOf?: string },
  ) {
    return this.debt.list(user.userId, query.householdId, query.asOf);
  }

  // Declared before ":accountId" so "payoff" is matched as a static route
  // rather than captured as an account id.
  @Get("payoff")
  payoff(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(debtPayoffQuerySchema))
    query: {
      householdId: string;
      method: "avalanche" | "snowball";
      asOf?: string;
      extraMonthlyMinor?: string;
    },
  ) {
    return this.debt.payoff(user.userId, query.householdId, {
      method: query.method,
      asOf: query.asOf,
      extraMonthlyMinor:
        query.extraMonthlyMinor != null && query.extraMonthlyMinor !== ""
          ? BigInt(query.extraMonthlyMinor)
          : undefined,
    });
  }

  @Get(":accountId")
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(accountIdParamSchema))
    params: { accountId: string },
    @Query(new ZodValidationPipe(householdAsOfQuerySchema))
    query: { householdId: string; asOf?: string },
  ) {
    return this.debt.detail(
      user.userId,
      query.householdId,
      params.accountId,
      query.asOf,
    );
  }
}
