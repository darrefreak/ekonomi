import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { IntelligenceModule } from "../intelligence/intelligence.module";
import { BudgetController } from "./budget.controller";
import { BudgetService } from "./budget.service";
import { SmartBudgetController } from "./smart-budget.controller";
import { SmartBudgetService } from "./smart-budget.service";
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
  imports: [AuthModule, HouseholdsModule, IntelligenceModule],
  controllers: [
    BudgetController,
    SmartBudgetController,
    SubscriptionsController,
    ContractsController,
    GoalsController,
    SinkingFundsController,
  ],
  providers: [
    PlanningMetricsService,
    BudgetService,
    SmartBudgetService,
    SubscriptionsService,
    ContractsService,
    GoalsService,
    SinkingFundsService,
  ],
  exports: [PlanningMetricsService, BudgetService],
})
export class PlanningModule {}
