import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DecisionsModule } from "../decisions/decisions.module";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { HouseholdsModule } from "../households/households.module";
import { MetricsModule } from "../metrics/metrics.module";
import { PlanningModule } from "../planning/planning.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { VehicleIntelModule } from "../vehicle-intel/vehicle-intel.module";
import { AdvisorController } from "./advisor.controller";
import { AdvisorService } from "./advisor.service";

@Module({
  imports: [
    AuthModule,
    HouseholdsModule,
    PlanningModule,
    DecisionsModule,
    VehiclesModule,
    VehicleIntelModule,
    MetricsModule,
    FeatureFlagsModule,
  ],
  controllers: [AdvisorController],
  providers: [AdvisorService],
})
export class AiModule {}
