import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { MerchantsController } from "./merchants.controller";
import { MerchantsService } from "./merchants.service";

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [MerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
