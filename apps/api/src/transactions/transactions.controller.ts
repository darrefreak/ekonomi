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
  idParamSchema,
  listTransactionsQuerySchema,
  updateTransactionSchema,
} from "@ffos/schemas";
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
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.transactions.listCategories(user.userId, query.householdId);
  }

  @Get("transactions")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listTransactionsQuerySchema))
    query: {
      householdId: string;
      limit?: string;
      q?: string;
      accountId?: string;
      from?: string;
      to?: string;
      includeExcluded?: string;
      vehicleId?: string;
    },
  ) {
    const limitRaw = query.limit ? Number(query.limit) : 50;
    const limit = Number.isFinite(limitRaw)
      ? Math.min(200, Math.max(1, Math.trunc(limitRaw)))
      : 50;
    return this.transactions.list(user.userId, query.householdId, {
      limit,
      q: query.q,
      accountId: query.accountId,
      from: query.from,
      to: query.to,
      includeExcluded:
        query.includeExcluded === "true" || query.includeExcluded === "1",
      vehicleId: query.vehicleId,
    });
  }

  @Get("transactions/:id")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ) {
    return this.transactions.get(user.userId, query.householdId, params.id);
  }

  @Patch("transactions/:id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateTransactionSchema)) body: unknown,
  ) {
    return this.transactions.update(
      user.userId,
      params.id,
      updateTransactionSchema.parse(body),
    );
  }
}
