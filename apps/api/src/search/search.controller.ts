import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { searchQuerySchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SearchService } from "./search.service";

@ApiTags("search")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/search")
export class SearchController {
  constructor(@Inject(SearchService) private readonly search: SearchService) {}

  @Get()
  query(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(searchQuerySchema))
    query: { householdId: string; q: string },
  ) {
    return this.search.search(user.userId, query.householdId, query.q ?? "");
  }
}
