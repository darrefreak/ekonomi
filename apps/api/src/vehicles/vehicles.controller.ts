import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createVehicleSchema,
  householdIdQuerySchema,
  idParamSchema,
  updateVehicleSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { IdempotencyKey } from "../common/idempotency-key.decorator";
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

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createVehicleSchema)) body: unknown,
    @IdempotencyKey() idempotencyKey?: string,
  ) {
    return this.vehicles.create(user.userId, createVehicleSchema.parse(body), {
      idempotencyKey,
    });
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateVehicleSchema)) body: unknown,
  ) {
    return this.vehicles.update(
      user.userId,
      params.id,
      updateVehicleSchema.parse(body),
    );
  }
}
