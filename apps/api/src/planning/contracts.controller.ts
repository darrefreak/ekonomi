import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { householdIdQuerySchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ContractsService } from "./contracts.service";

@ApiTags("contracts")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/contracts")
export class ContractsController {
  constructor(@Inject(ContractsService) private readonly contracts: ContractsService) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(householdIdQuerySchema))
    query: { householdId: string },
  ) {
    return this.contracts.get(user.userId, query.householdId);
  }
}
