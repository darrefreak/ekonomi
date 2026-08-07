import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DebtModule } from "../debt/debt.module";
import { HouseholdsModule } from "../households/households.module";
import { MetricsModule } from "../metrics/metrics.module";
import { PlanningModule } from "../planning/planning.module";
import { DecisionsController } from "./decisions.controller";
import { DecisionsService } from "./decisions.service";

@Module({
  imports: [
    AuthModule,
    HouseholdsModule,
    MetricsModule,
    PlanningModule,
    DebtModule,
  ],
  controllers: [DecisionsController],
  providers: [DecisionsService],
  exports: [DecisionsService],
})
export class DecisionsModule {}
