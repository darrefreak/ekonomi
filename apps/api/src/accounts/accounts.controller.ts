import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createAccountSchema,
  householdIdQuerySchema,
  idParamSchema,
  listAccountsQuerySchema,
  updateAccountSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { IdempotencyKey } from "../common/idempotency-key.decorator";
import { AccountsService } from "./accounts.service";

@ApiTags("accounts")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/accounts")
export class AccountsController {
  constructor(@Inject(AccountsService) private readonly accounts: AccountsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listAccountsQuerySchema))
    query: { householdId: string; includeArchived?: string },
  ) {
    return this.accounts.list(user.userId, query.householdId, {
      includeArchived:
        query.includeArchived === "true" || query.includeArchived === "1",
    });
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createAccountSchema)) body: unknown,
    @IdempotencyKey() idempotencyKey?: string,
  ) {
    return this.accounts.create(user.userId, createAccountSchema.parse(body), {
      idempotencyKey,
    });
  }

  @Get(":id")
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ) {
    const account = await this.accounts.get(
      user.userId,
      query.householdId,
      params.id,
    );
    if (!account) throw new NotFoundException("Account not found");
    return account;
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateAccountSchema)) body: unknown,
  ) {
    return this.accounts.update(
      user.userId,
      params.id,
      updateAccountSchema.parse(body),
    );
  }

  @Delete(":id")
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ) {
    return this.accounts.archive(user.userId, query.householdId, params.id);
  }
}
