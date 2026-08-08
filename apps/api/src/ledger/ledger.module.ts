import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { MerchantsModule } from "../merchants/merchants.module";
import { EconomicEventsService } from "./economic-events.service";
import { ECONOMIC_EVENTS_SERVICE } from "./economic-events.token";
import { LedgerController } from "./ledger.controller";
import { LedgerTruthService } from "./ledger-truth.service";

@Module({
  imports: [AuthModule, HouseholdsModule, MerchantsModule],
  controllers: [LedgerController],
  providers: [
    LedgerTruthService,
    EconomicEventsService,
    { provide: ECONOMIC_EVENTS_SERVICE, useExisting: EconomicEventsService },
  ],
  exports: [LedgerTruthService, EconomicEventsService, ECONOMIC_EVENTS_SERVICE],
})
export class LedgerModule {}
