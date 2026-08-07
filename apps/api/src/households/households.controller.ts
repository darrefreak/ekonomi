import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createHouseholdSchema } from "@ffos/schemas";
import type { Request } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { HouseholdsService } from "./households.service";

@ApiTags("households")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/households")
export class HouseholdsController {
  constructor(
    @Inject(HouseholdsService) private readonly households: HouseholdsService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createHouseholdSchema)) body: unknown,
    @Req() req: Request & { requestId?: string },
  ) {
    return this.households.create(
      user.userId,
      createHouseholdSchema.parse(body),
      req.requestId,
    );
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.households.listForUser(user.userId);
  }
}
