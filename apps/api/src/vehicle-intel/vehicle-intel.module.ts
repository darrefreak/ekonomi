import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { VehicleIntelController } from "./vehicle-intel.controller";
import { VehicleIntelService } from "./vehicle-intel.service";

@Module({
  imports: [AuthModule, HouseholdsModule, VehiclesModule],
  controllers: [VehicleIntelController],
  providers: [VehicleIntelService],
  exports: [VehicleIntelService],
})
export class VehicleIntelModule {}
