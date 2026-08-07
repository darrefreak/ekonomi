import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { getDb } from "../db/client";
import { featureFlags } from "../db/schema";

@ApiTags("feature-flags")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/feature-flags")
export class FeatureFlagsController {
  @Get()
  async list() {
    return getDb().select().from(featureFlags);
  }
}
