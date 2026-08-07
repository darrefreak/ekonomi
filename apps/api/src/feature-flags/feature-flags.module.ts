import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FeatureFlagsController } from "./feature-flags.controller";

@Module({
  imports: [AuthModule],
  controllers: [FeatureFlagsController],
})
export class FeatureFlagsModule {}
