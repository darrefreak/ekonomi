import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { resolveReviewSchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ReviewService } from "./review.service";

@ApiTags("review")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/review")
export class ReviewController {
  constructor(@Inject(ReviewService) private readonly review: ReviewService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("householdId") householdId: string,
  ) {
    return this.review.list(user.userId, householdId);
  }

  @Post("resolve")
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(resolveReviewSchema)) body: unknown,
  ) {
    return this.review.resolve(
      user.userId,
      resolveReviewSchema.parse(body),
    );
  }
}
