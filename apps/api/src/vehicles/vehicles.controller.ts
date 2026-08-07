import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { VehiclesService } from "./vehicles.service";

@ApiTags("vehicles")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/vehicles")
export class VehiclesController {
  constructor(@Inject(VehiclesService) private readonly vehicles: VehiclesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.vehicles.list(user.userId, householdId);
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
    @Param("id") id: string,
  ) {
    return this.vehicles.get(user.userId, householdId, id);
  }
}
