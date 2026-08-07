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
import { updateTransactionSchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { TransactionsService } from "./transactions.service";

@ApiTags("transactions")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1")
export class TransactionsController {
  constructor(
    @Inject(TransactionsService) private readonly transactions: TransactionsService,
  ) {}

  @Get("categories")
  listCategories(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.transactions.listCategories(user.userId, householdId);
  }

  @Get("transactions")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
    @Query("limit") limit?: string,
    @Query("q") q?: string,
    @Query("accountId") accountId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("includeExcluded") includeExcluded?: string,
    @Query("vehicleId") vehicleId?: string,
  ) {
    return this.transactions.list(user.userId, householdId, {
      limit: limit ? Number(limit) : 50,
      q,
      accountId,
      from,
      to,
      includeExcluded:
        includeExcluded === "true" || includeExcluded === "1",
      vehicleId,
    });
  }

  @Get("transactions/:id")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
    @Param("id") id: string,
  ) {
    return this.transactions.get(user.userId, householdId, id);
  }

  @Patch("transactions/:id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTransactionSchema)) body: unknown,
  ) {
    return this.transactions.update(
      user.userId,
      id,
      updateTransactionSchema.parse(body),
    );
  }
}
