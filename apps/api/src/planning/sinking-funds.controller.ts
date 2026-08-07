import {
  Body,
  Controller,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  contributeSinkingFundSchema,
  createSinkingFundSchema,
  fundIdParamSchema,
  updateSinkingFundSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SinkingFundsService } from "./sinking-funds.service";

@ApiTags("sinking-funds")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/sinking-funds")
export class SinkingFundsController {
  constructor(
    @Inject(SinkingFundsService) private readonly funds: SinkingFundsService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createSinkingFundSchema)) body: unknown,
  ) {
    return this.funds.create(
      user.userId,
      createSinkingFundSchema.parse(body),
    );
  }

  @Patch(":fundId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(fundIdParamSchema))
    params: { fundId: string },
    @Body(new ZodValidationPipe(updateSinkingFundSchema)) body: unknown,
  ) {
    return this.funds.update(
      user.userId,
      params.fundId,
      updateSinkingFundSchema.parse(body),
    );
  }

  @Post(":fundId/contributions")
  contribute(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(fundIdParamSchema))
    params: { fundId: string },
    @Body(new ZodValidationPipe(contributeSinkingFundSchema)) body: unknown,
  ) {
    return this.funds.contribute(
      user.userId,
      params.fundId,
      contributeSinkingFundSchema.parse(body),
    );
  }
}
