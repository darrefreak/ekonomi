import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { householdAsOfQuerySchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { resolveAsOf } from "../common/as-of";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { WealthService } from "./wealth.service";

@ApiTags("wealth")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1")
export class WealthController {
  constructor(@Inject(WealthService) private readonly wealth: WealthService) {}

  @Get("investments")
  investments(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdAsOfQuerySchema))
    query: { householdId: string; asOf?: string },
  ) {
    return this.wealth.investments(
      user.userId,
      query.householdId,
      resolveAsOf(query.asOf),
    );
  }

  @Get("assets")
  assets(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdAsOfQuerySchema))
    query: { householdId: string; asOf?: string },
  ) {
    return this.wealth.assets(
      user.userId,
      query.householdId,
      resolveAsOf(query.asOf),
    );
  }
}
