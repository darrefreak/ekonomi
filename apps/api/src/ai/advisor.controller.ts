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
  advisorChatRequestSchema,
  trackRecommendationOutcomeSchema,
  updateRecommendationOutcomeSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AdvisorService } from "./advisor.service";

@ApiTags("advisor")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/advisor")
export class AdvisorController {
  constructor(@Inject(AdvisorService) private readonly advisor: AdvisorService) {}

  @Get("brief")
  brief(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.advisor.brief(user.userId, householdId);
  }

  @Post("chat")
  chat(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(advisorChatRequestSchema)) body: unknown,
  ) {
    return this.advisor.chat(
      user.userId,
      advisorChatRequestSchema.parse(body),
    );
  }

  @Get("outcomes")
  outcomes(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.advisor.outcomes(user.userId, householdId);
  }

  @Post("outcomes")
  track(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(trackRecommendationOutcomeSchema)) body: unknown,
  ) {
    return this.advisor.track(
      user.userId,
      trackRecommendationOutcomeSchema.parse(body),
    );
  }

  @Patch("outcomes/:id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateRecommendationOutcomeSchema)) body: unknown,
  ) {
    return this.advisor.updateOutcome(
      user.userId,
      id,
      updateRecommendationOutcomeSchema.parse(body),
    );
  }
}
