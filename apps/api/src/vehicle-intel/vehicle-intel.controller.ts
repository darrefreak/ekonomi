import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { VehicleIntelService } from "./vehicle-intel.service";

@ApiTags("vehicle-intel")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/vehicle-market")
export class VehicleIntelController {
  constructor(
    @Inject(VehicleIntelService) private readonly intel: VehicleIntelService,
  ) {}

  @Get()
  market(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.intel.market(user.userId, householdId);
  }
}
