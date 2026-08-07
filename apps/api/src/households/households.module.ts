import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdAccessService } from "./household-access.service";
import { HouseholdsController } from "./households.controller";
import { HouseholdsService } from "./households.service";

@Module({
  imports: [AuthModule],
  controllers: [HouseholdsController],
  providers: [HouseholdsService, HouseholdAccessService],
  exports: [HouseholdsService, HouseholdAccessService],
})
export class HouseholdsModule {}
