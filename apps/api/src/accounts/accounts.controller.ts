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
import { createAccountSchema, updateAccountSchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
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
    @Query("householdId") householdId: string,
    @Query("includeArchived") includeArchived?: string,
  ) {
    return this.accounts.list(user.userId, householdId, {
      includeArchived: includeArchived === "true" || includeArchived === "1",
    });
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createAccountSchema)) body: unknown,
  ) {
    return this.accounts.create(user.userId, createAccountSchema.parse(body));
  }

  @Get(":id")
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
    @Param("id") id: string,
  ) {
    const account = await this.accounts.get(user.userId, householdId, id);
    if (!account) throw new NotFoundException("Account not found");
    return account;
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAccountSchema)) body: unknown,
  ) {
    return this.accounts.update(
      user.userId,
      id,
      updateAccountSchema.parse(body),
    );
  }

  @Delete(":id")
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
    @Param("id") id: string,
  ) {
    return this.accounts.archive(user.userId, householdId, id);
  }
}
