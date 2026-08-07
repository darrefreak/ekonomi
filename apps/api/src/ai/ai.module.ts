import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DecisionsModule } from "../decisions/decisions.module";
import { HouseholdsModule } from "../households/households.module";
import { PlanningModule } from "../planning/planning.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { AdvisorController } from "./advisor.controller";
import { AdvisorService } from "./advisor.service";

@Module({
  imports: [
    AuthModule,
    HouseholdsModule,
    PlanningModule,
    DecisionsModule,
    VehiclesModule,
  ],
  controllers: [AdvisorController],
  providers: [AdvisorService],
})
export class AiModule {}
