import {
  Body,
  Controller,
  Delete,
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
  createVehicleCandidateFromListingSchema,
  createVehicleCandidateSchema,
  householdIdQuerySchema,
  idParamSchema,
  updateVehicleCandidateSchema,
  vehicleMarketQuerySchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { VehicleIntelService } from "./vehicle-intel.service";

@ApiTags("vehicle-intel")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1")
export class VehicleIntelController {
  constructor(
    @Inject(VehicleIntelService) private readonly intel: VehicleIntelService,
  ) {}

  @Get("vehicle-market")
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

  @Post("vehicle-candidates")
  createCandidate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createVehicleCandidateSchema)) body: unknown,
  ) {
    return this.intel.createCandidate(
      user.userId,
      createVehicleCandidateSchema.parse(body),
    );
  }

  @Post("vehicle-candidates/from-listing")
  createFromListing(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createVehicleCandidateFromListingSchema))
    body: unknown,
  ) {
    return this.intel.createCandidateFromListing(
      user.userId,
      createVehicleCandidateFromListingSchema.parse(body),
    );
  }

  @Patch("vehicle-candidates/:id")
  updateCandidate(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateVehicleCandidateSchema)) body: unknown,
  ) {
    return this.intel.updateCandidate(
      user.userId,
      params.id,
      updateVehicleCandidateSchema.parse(body),
    );
  }

  @Delete("vehicle-candidates/:id")
  archiveCandidate(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ) {
    return this.intel.archiveCandidate(
      user.userId,
      query.householdId,
      params.id,
    );
  }
}
