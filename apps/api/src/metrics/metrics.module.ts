import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { HouseholdMetricsService } from "./household-metrics.service";
import { MetricRegistryService } from "./metric-registry.service";
import { MetricsController } from "./metrics.controller";

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [MetricsController],
  providers: [HouseholdMetricsService, MetricRegistryService],
  exports: [HouseholdMetricsService, MetricRegistryService],
})
export class MetricsModule {}
