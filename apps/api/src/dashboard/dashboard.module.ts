import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { MetricsModule } from "../metrics/metrics.module";
import { ReviewModule } from "../review/review.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [AuthModule, HouseholdsModule, MetricsModule, ReviewModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
