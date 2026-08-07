import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { FeatureFlagsModule } from "./feature-flags/feature-flags.module";
import { HealthModule } from "./health/health.module";
import { HouseholdsModule } from "./households/households.module";
import { SettingsModule } from "./settings/settings.module";

@Module({
  imports: [
    HealthModule,
    AuthModule,
    HouseholdsModule,
    DashboardModule,
    FeatureFlagsModule,
    SettingsModule,
  ],
})
export class AppModule {}
