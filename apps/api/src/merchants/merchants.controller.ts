import { Body, Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  merchantNormalizeQuerySchema,
  verifyMerchantAliasSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MerchantsService } from "./merchants.service";

@ApiTags("merchants")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/merchants")
export class MerchantsController {
  constructor(
    @Inject(MerchantsService) private readonly merchants: MerchantsService,
  ) {}

  @Get("normalize")
  normalize(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(merchantNormalizeQuerySchema))
    query: { householdId: string; raw: string },
  ) {
    return this.merchants.normalizePreview(
      user.userId,
      query.householdId,
      query.raw,
    );
  }

  @Post("verify-alias")
  verifyAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(verifyMerchantAliasSchema)) body: unknown,
  ) {
    return this.merchants.verifyAlias(
      user.userId,
      verifyMerchantAliasSchema.parse(body),
    );
  }
}
