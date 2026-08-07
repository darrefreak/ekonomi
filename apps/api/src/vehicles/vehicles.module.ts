import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { VehiclesController } from "./vehicles.controller";
import { VehiclesService } from "./vehicles.service";

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
