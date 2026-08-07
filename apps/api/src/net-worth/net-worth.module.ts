import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { MetricsModule } from "../metrics/metrics.module";
import { NetWorthController } from "./net-worth.controller";
import { NetWorthService } from "./net-worth.service";

@Module({
  imports: [AuthModule, HouseholdsModule, MetricsModule],
  controllers: [NetWorthController],
  providers: [NetWorthService],
})
export class NetWorthModule {}
