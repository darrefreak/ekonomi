import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { DebtController } from "./debt.controller";
import { DebtService } from "./debt.service";

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [DebtController],
  providers: [DebtService],
  exports: [DebtService],
})
export class DebtModule {}
