import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { EconomicEventsService } from "./economic-events.service";
import { LedgerController } from "./ledger.controller";
import { LedgerTruthService } from "./ledger-truth.service";

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [LedgerController],
  providers: [LedgerTruthService, EconomicEventsService],
  exports: [LedgerTruthService, EconomicEventsService],
})
export class LedgerModule {}
