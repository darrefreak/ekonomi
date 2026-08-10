import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FeatureFlagsController } from "./feature-flags.controller";
import { FeatureFlagsService } from "./feature-flags.service";

@Module({
  imports: [AuthModule],
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
