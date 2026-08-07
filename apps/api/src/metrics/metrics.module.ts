import { Module } from "@nestjs/common";
import { HouseholdMetricsService } from "./household-metrics.service";

@Module({
  providers: [HouseholdMetricsService],
  exports: [HouseholdMetricsService],
})
export class MetricsModule {}
