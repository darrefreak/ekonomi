import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { householdIdQuerySchema, idParamSchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
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
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.vehicles.list(user.userId, query.householdId);
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ) {
    return this.vehicles.get(user.userId, query.householdId, params.id);
  }
}
