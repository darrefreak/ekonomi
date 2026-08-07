import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { WealthController } from "./wealth.controller";
import { WealthService } from "./wealth.service";

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [WealthController],
  providers: [WealthService],
  exports: [WealthService],
})
export class WealthModule {}
