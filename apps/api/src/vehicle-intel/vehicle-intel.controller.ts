import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { vehicleMarketQuerySchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
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
    @Query(new ZodValidationPipe(vehicleMarketQuerySchema))
    query: { householdId: string; vehicleId?: string },
  ) {
    return this.intel.market(
      user.userId,
      query.householdId,
      query.vehicleId,
    );
  }
}
