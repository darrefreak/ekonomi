import {
  Body,
  Controller,
  Delete,
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
  createCategorySchema,
  householdIdQuerySchema,
  idParamSchema,
  listCategoriesQuerySchema,
  listMerchantsQuerySchema,
  listTransactionsQuerySchema,
  updateCategorySchema,
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
    @Query(new ZodValidationPipe(listCategoriesQuerySchema))
    query: { householdId: string; includeArchived?: string },
  ) {
    return this.transactions.listCategories(user.userId, query.householdId, {
      includeArchived:
        query.includeArchived === "true" || query.includeArchived === "1",
    });
  }

  @Post("categories")
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCategorySchema)) body: unknown,
  ) {
    return this.transactions.createCategory(
      user.userId,
      createCategorySchema.parse(body),
    );
  }

  @Patch("categories/:id")
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateCategorySchema)) body: unknown,
  ) {
    return this.transactions.updateCategory(
      user.userId,
      params.id,
      updateCategorySchema.parse(body),
    );
  }

  @Delete("categories/:id")
  archiveCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ) {
    return this.transactions.archiveCategory(
      user.userId,
      query.householdId,
      params.id,
    );
  }

  @Get("merchants")
  listMerchants(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listMerchantsQuerySchema))
    query: { householdId: string; q?: string },
  ) {
    return this.transactions.listMerchants(
      user.userId,
      query.householdId,
      query.q,
    );
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
      categoryId?: string;
      merchantId?: string;
      merchantMissing?: string;
      direction?: "inflow" | "outflow";
      minAmountMinor?: string;
      maxAmountMinor?: string;
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
      categoryId: query.categoryId,
      merchantId: query.merchantId,
      merchantMissing:
        query.merchantMissing === "true" || query.merchantMissing === "1",
      direction: query.direction,
      minAmountMinor: query.minAmountMinor,
      maxAmountMinor: query.maxAmountMinor,
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
