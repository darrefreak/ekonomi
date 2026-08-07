import { Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { IntakeService } from "./intake.service";

@ApiTags("intake")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1")
export class IntakeController {
  constructor(@Inject(IntakeService) private readonly intake: IntakeService) {}

  @Get("documents")
  documents(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.intake.documents(user.userId, householdId);
  }

  @Get("integrations")
  integrations(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.intake.integrations(user.userId, householdId);
  }

  @Get("imports")
  imports(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.intake.imports(user.userId, householdId);
  }

  @Post("integrations/sync")
  sync(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.intake.fakeSync(user.userId, householdId);
  }
}
