import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { MetricsModule } from "../metrics/metrics.module";
import { FinancialCoverageController } from "./financial-coverage.controller";
import { FinancialCoverageService } from "./financial-coverage.service";

@Module({
  imports: [AuthModule, HouseholdsModule, MetricsModule],
  controllers: [FinancialCoverageController],
  providers: [FinancialCoverageService],
})
export class FinancialCoverageModule {}
