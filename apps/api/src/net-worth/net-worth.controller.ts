import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { householdIdQuerySchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NetWorthService } from "./net-worth.service";

@ApiTags("net-worth")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/net-worth")
export class NetWorthController {
  constructor(@Inject(NetWorthService) private readonly netWorth: NetWorthService) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.netWorth.get(user.userId, query.householdId);
  }
}
