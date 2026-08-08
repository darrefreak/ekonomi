import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DebtModule } from "../debt/debt.module";
import { HouseholdsModule } from "../households/households.module";
import { MetricsModule } from "../metrics/metrics.module";
import { PlanningModule } from "../planning/planning.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { AnomalyService } from "./anomaly.service";
import { DecisionsController } from "./decisions.controller";
import { DecisionsService } from "./decisions.service";
import { OpportunitiesGeneratorService } from "./opportunities-generator.service";

@Module({
  imports: [
    AuthModule,
    HouseholdsModule,
    MetricsModule,
    PlanningModule,
    DebtModule,
    VehiclesModule,
  ],
  controllers: [DecisionsController],
  providers: [DecisionsService, OpportunitiesGeneratorService, AnomalyService],
  exports: [DecisionsService, OpportunitiesGeneratorService, AnomalyService],
})
export class DecisionsModule {}
