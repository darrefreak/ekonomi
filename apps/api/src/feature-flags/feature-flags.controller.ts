import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { FeatureFlagsService } from "./feature-flags.service";

@ApiTags("feature-flags")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/feature-flags")
export class FeatureFlagsController {
  constructor(
    @Inject(FeatureFlagsService) private readonly flags: FeatureFlagsService,
  ) {}

  @Get()
  list() {
    return this.flags.list();
  }
}
