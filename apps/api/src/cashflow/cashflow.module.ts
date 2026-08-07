import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { MetricsModule } from "../metrics/metrics.module";
import { CashflowController } from "./cashflow.controller";
import { CashflowService } from "./cashflow.service";

@Module({
  imports: [AuthModule, HouseholdsModule, MetricsModule],
  controllers: [CashflowController],
  providers: [CashflowService],
})
export class CashflowModule {}
