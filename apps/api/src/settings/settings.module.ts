import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SettingsController } from "./settings.controller";

@Module({
  imports: [AuthModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
