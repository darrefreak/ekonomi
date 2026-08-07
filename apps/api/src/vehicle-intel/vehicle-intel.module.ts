import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { VehicleIntelController } from "./vehicle-intel.controller";
import { VehicleIntelService } from "./vehicle-intel.service";

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [VehicleIntelController],
  providers: [VehicleIntelService],
})
export class VehicleIntelModule {}
