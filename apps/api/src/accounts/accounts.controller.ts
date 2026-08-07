import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
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
  ) {
    return this.accounts.list(user.userId, householdId);
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
}
