import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { BudgetController } from "./budget.controller";
import { BudgetService } from "./budget.service";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";
import { GoalsController } from "./goals.controller";
import { GoalsService } from "./goals.service";
import { PlanningMetricsService } from "./planning-metrics.service";
import { SinkingFundsController } from "./sinking-funds.controller";
import { SinkingFundsService } from "./sinking-funds.service";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [
    BudgetController,
    SubscriptionsController,
    ContractsController,
    GoalsController,
    SinkingFundsController,
  ],
  providers: [
    PlanningMetricsService,
    BudgetService,
    SubscriptionsService,
    ContractsService,
    GoalsService,
    SinkingFundsService,
  ],
  exports: [PlanningMetricsService, BudgetService],
})
export class PlanningModule {}
