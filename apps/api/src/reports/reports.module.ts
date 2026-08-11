import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CalendarModule } from "../calendar/calendar.module";
import { HouseholdsModule } from "../households/households.module";
import { IntelligenceModule } from "../intelligence/intelligence.module";
import { MetricsModule } from "../metrics/metrics.module";
import { ReportExploreService } from "./report-explore.service";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { WeeklyReviewService } from "./weekly-review.service";

@Module({
  imports: [
    AuthModule,
    HouseholdsModule,
    MetricsModule,
    CalendarModule,
    IntelligenceModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportExploreService, WeeklyReviewService],
})
export class ReportsModule {}
